import { Router } from 'express';
import { Priority, Prisma, RequirementStatus, Role, TaskStatus } from '@prisma/client';
import { z } from 'zod';
import { audit } from '../lib/audit.js';
import { REQUIREMENT_TYPES, TASK_TYPES, taskTypeForRequirement } from '../lib/catalogs.js';
import { ah, badRequest, notFound } from '../lib/errors.js';
import { notifyUsers, pointManagerIds } from '../lib/notifications.js';
import { prisma } from '../lib/prisma.js';
import { dateRange, idParam, listQuery, optionalDateTime, optionalFk, optionalText, paginate, parse } from '../lib/query.js';
import { assertPointAccess, pointFilter } from '../lib/scope.js';
import { currentUser, requireRole } from '../middleware/auth.js';
import { getPointName, prepareAssignee, syncRequirement } from './taskService.js';

export const requirementsRouter = Router();

const reqBody = z.object({
  pointId: z.coerce.number().int().positive(),
  type: z.enum(REQUIREMENT_TYPES),
  productId: optionalFk,
  description: z.string().trim().min(3).max(2000),
  priority: z.nativeEnum(Priority).default(Priority.MEDIA),
  notes: optionalText,
});

const include = {
  point: { select: { id: true, name: true, code: true } },
  product: { select: { id: true, name: true, unit: true } },
  createdBy: { select: { id: true, name: true } },
  assignee: { select: { id: true, name: true } },
  tasks: { select: { id: true, status: true, assignee: { select: { id: true, name: true } } } },
} satisfies Prisma.RequirementInclude;

requirementsRouter.get(
  '/',
  ah(async (req, res) => {
    const me = currentUser(req);
    const q = parse(listQuery, req.query);
    const where: Prisma.RequirementWhereInput = { ...(await pointFilter(me, q.pointId)) };
    if (me.role === Role.WORKER) where.createdById = me.id;
    if (q.status) where.status = q.status as RequirementStatus;
    if (q.type) where.type = q.type;
    if (q.priority) where.priority = q.priority as Priority;
    if (q.productId) where.productId = q.productId;
    if (q.userId) where.OR = [{ createdById: q.userId }, { assigneeId: q.userId }];
    const range = dateRange(q.from, q.to);
    if (range) where.createdAt = range;
    if (q.q) where.description = { contains: q.q, mode: 'insensitive' };
    const [items, total] = await Promise.all([
      prisma.requirement.findMany({ where, include, orderBy: { createdAt: 'desc' }, ...paginate(q) }),
      prisma.requirement.count({ where }),
    ]);
    res.json({ items, total, page: q.page, pageSize: q.pageSize });
  }),
);

requirementsRouter.get(
  '/:id',
  ah(async (req, res) => {
    const me = currentUser(req);
    const { id } = parse(idParam, req.params);
    const item = await prisma.requirement.findUnique({ where: { id }, include });
    if (!item) throw notFound('Requerimiento no encontrado');
    await assertPointAccess(me, item.pointId);
    res.json(item);
  }),
);

requirementsRouter.post(
  '/',
  ah(async (req, res) => {
    const me = currentUser(req);
    const body = parse(reqBody, req.body);
    await assertPointAccess(me, body.pointId);
    const item = await prisma.requirement.create({
      data: { ...body, productId: body.productId ?? null, notes: body.notes ?? null, createdById: me.id },
      include,
    });
    await audit(req, 'REQUIREMENT_CREATED', 'Requirement', item.id, { pointId: item.pointId, type: item.type });
    await notifyUsers((await pointManagerIds(item.pointId)).filter((id) => id !== me.id), {
      type: 'REQUERIMIENTO_NUEVO',
      title: 'Nuevo requerimiento',
      message: `${item.point.name}: ${item.description}`,
      link: `/requerimientos?id=${item.id}`,
    });
    res.status(201).json(item);
  }),
);

requirementsRouter.put(
  '/:id',
  requireRole(Role.ADMIN, Role.SUPERVISOR),
  ah(async (req, res) => {
    const me = currentUser(req);
    const { id } = parse(idParam, req.params);
    const body = parse(reqBody, req.body);
    const before = await prisma.requirement.findUnique({ where: { id } });
    if (!before) throw notFound('Requerimiento no encontrado');
    await assertPointAccess(me, before.pointId);
    await assertPointAccess(me, body.pointId);
    const item = await prisma.requirement.update({
      where: { id },
      data: { ...body, productId: body.productId ?? null, notes: body.notes ?? null },
      include,
    });
    await audit(req, 'REQUIREMENT_UPDATED', 'Requirement', id);
    res.json(item);
  }),
);

requirementsRouter.patch(
  '/:id/status',
  requireRole(Role.ADMIN, Role.SUPERVISOR),
  ah(async (req, res) => {
    const me = currentUser(req);
    const { id } = parse(idParam, req.params);
    const { status, notes } = parse(z.object({ status: z.nativeEnum(RequirementStatus), notes: optionalText }), req.body);
    const before = await prisma.requirement.findUnique({ where: { id } });
    if (!before) throw notFound('Requerimiento no encontrado');
    await assertPointAccess(me, before.pointId);
    const item = await prisma.requirement.update({
      where: { id },
      data: {
        status,
        notes: notes ?? before.notes,
        completedAt: status === RequirementStatus.COMPLETADO ? new Date() : before.completedAt,
      },
      include,
    });
    await audit(req, 'REQUIREMENT_STATUS', 'Requirement', id, { from: before.status, to: status });
    res.json(item);
  }),
);

requirementsRouter.post(
  '/:id/convert',
  requireRole(Role.ADMIN, Role.SUPERVISOR),
  ah(async (req, res) => {
    const me = currentUser(req);
    const { id } = parse(idParam, req.params);
    const body = parse(
      z.object({
        assigneeId: optionalFk,
        type: z.enum(TASK_TYPES).optional(),
        description: z.string().trim().min(3).max(2000).optional(),
        priority: z.nativeEnum(Priority).optional(),
        dueDate: optionalDateTime,
        notes: optionalText,
      }),
      req.body,
    );
    const requirement = await prisma.requirement.findUnique({ where: { id } });
    if (!requirement) throw notFound('Requerimiento no encontrado');
    await assertPointAccess(me, requirement.pointId);
    if (requirement.status === RequirementStatus.COMPLETADO || requirement.status === RequirementStatus.CANCELADO) {
      throw badRequest('El requerimiento ya está cerrado');
    }
    const task = await prisma.$transaction(async (tx) => {
      if (body.assigneeId) await prepareAssignee(tx, me.companyId, body.assigneeId, requirement.pointId);
      const created = await tx.task.create({
        data: {
          pointId: requirement.pointId,
          requirementId: requirement.id,
          productId: requirement.productId,
          type: body.type ?? taskTypeForRequirement(requirement.type),
          description: body.description ?? requirement.description,
          priority: body.priority ?? requirement.priority,
          dueDate: body.dueDate ?? null,
          notes: body.notes ?? null,
          createdById: me.id,
          assigneeId: body.assigneeId ?? null,
          assignedAt: body.assigneeId ? new Date() : null,
          status: body.assigneeId ? TaskStatus.ASIGNADA : TaskStatus.PENDIENTE,
        },
      });
      if (body.assigneeId) await syncRequirement(tx, requirement.id, RequirementStatus.ASIGNADO, body.assigneeId);
      return created;
    });
    await audit(req, 'REQUIREMENT_CONVERTED', 'Task', task.id, { requirementId: id, assigneeId: task.assigneeId });
    if (task.assigneeId) {
      await audit(req, 'TASK_ASSIGNED', 'Task', task.id, { assigneeId: task.assigneeId });
      await notifyUsers([task.assigneeId], {
        type: 'TAREA_ASIGNADA',
        title: 'Nueva tarea asignada',
        message: `${await getPointName(task.pointId)}: ${task.description}`,
        link: `/tareas/${task.id}`,
      });
    }
    res.status(201).json(task);
  }),
);

