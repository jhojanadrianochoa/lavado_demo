import { Router } from 'express';
import { Priority, Prisma, RequirementStatus, Role, TaskStatus } from '@prisma/client';
import { z } from 'zod';
import type { AuthUser } from '../lib/auth.js';
import { audit } from '../lib/audit.js';
import { TASK_TYPES } from '../lib/catalogs.js';
import { ah, badRequest, forbidden, notFound } from '../lib/errors.js';
import { notifyUsers, pointManagerIds } from '../lib/notifications.js';
import { prisma } from '../lib/prisma.js';
import { dateRange, idParam, listQuery, optionalDateTime, optionalFk, optionalText, paginate, parse } from '../lib/query.js';
import { getSettings } from '../lib/settings.js';
import { assertPointAccess, isManager, pointFilter } from '../lib/scope.js';
import { currentUser, requireRole } from '../middleware/auth.js';
import { getPointName, prepareAssignee, syncRequirement } from './taskService.js';

export const tasksRouter = Router();

const OPEN: TaskStatus[] = [TaskStatus.PENDIENTE, TaskStatus.ASIGNADA, TaskStatus.EN_PROCESO];

const taskBody = z.object({
  pointId: z.coerce.number().int().positive(),
  type: z.enum(TASK_TYPES),
  productId: optionalFk,
  description: z.string().trim().min(3).max(2000),
  priority: z.nativeEnum(Priority).default(Priority.MEDIA),
  dueDate: optionalDateTime,
  notes: optionalText,
  assigneeId: optionalFk,
});

const userMini = { select: { id: true, name: true, username: true } } as const;

const listInclude = {
  point: { select: { id: true, name: true, code: true } },
  product: { select: { id: true, name: true, unit: true } },
  assignee: userMini,
  createdBy: userMini,
  _count: { select: { fillings: true, photos: true, incidents: true } },
} satisfies Prisma.TaskInclude;

const detailInclude = {
  point: { select: { id: true, name: true, code: true, address: true, city: true } },
  product: { select: { id: true, name: true, unit: true } },
  assignee: userMini,
  createdBy: userMini,
  requirement: { select: { id: true, type: true, description: true, status: true } },
  fillings: {
    include: { product: { select: { id: true, name: true } }, user: userMini, photos: { select: { id: true, type: true, takenAt: true } } },
    orderBy: { filledAt: 'desc' },
  },
  photos: { include: { user: userMini }, orderBy: { takenAt: 'desc' } },
  incidents: { include: { reportedBy: userMini }, orderBy: { createdAt: 'desc' } },
} satisfies Prisma.TaskInclude;

async function loadTaskFor(user: AuthUser, id: number) {
  const task = await prisma.task.findUnique({ where: { id } });
  if (!task) throw notFound('Tarea no encontrada');
  if (user.role === Role.WORKER) {
    if (task.assigneeId !== user.id) throw forbidden('Esta tarea no está asignada a usted');
  } else {
    await assertPointAccess(user, task.pointId);
  }
  return task;
}

tasksRouter.get(
  '/',
  ah(async (req, res) => {
    const me = currentUser(req);
    const q = parse(listQuery.extend({ open: z.enum(['true']).optional(), mine: z.enum(['true']).optional() }), req.query);
    const where: Prisma.TaskWhereInput = { ...(await pointFilter(me, q.pointId)) };
    if (me.role === Role.WORKER || q.mine) where.assigneeId = me.id;
    else if (q.userId) where.assigneeId = q.userId;
    if (q.status) where.status = q.status as TaskStatus;
    else if (q.open) where.status = { in: OPEN };
    if (q.type) where.type = q.type;
    if (q.priority) where.priority = q.priority as Priority;
    if (q.productId) where.productId = q.productId;
    const range = dateRange(q.from, q.to);
    if (range) where.createdAt = range;
    if (q.q) {
      const asId = Number(q.q.replace('#', ''));
      where.OR = [{ description: { contains: q.q, mode: 'insensitive' } }, { point: { name: { contains: q.q, mode: 'insensitive' } } }, ...(asId ? [{ id: asId }] : [])];
    }
    const [items, total] = await Promise.all([
      prisma.task.findMany({ where, include: listInclude, orderBy: [{ createdAt: 'desc' }], ...paginate(q) }),
      prisma.task.count({ where }),
    ]);
    res.json({ items, total, page: q.page, pageSize: q.pageSize });
  }),
);

tasksRouter.get(
  '/:id',
  ah(async (req, res) => {
    const me = currentUser(req);
    const { id } = parse(idParam, req.params);
    await loadTaskFor(me, id);
    res.json(await prisma.task.findUniqueOrThrow({ where: { id }, include: detailInclude }));
  }),
);

tasksRouter.post(
  '/',
  requireRole(Role.ADMIN, Role.SUPERVISOR),
  ah(async (req, res) => {
    const me = currentUser(req);
    const body = parse(taskBody, req.body);
    await assertPointAccess(me, body.pointId);
    const task = await prisma.$transaction(async (tx) => {
      if (body.assigneeId) await prepareAssignee(tx, me.companyId, body.assigneeId, body.pointId);
      return tx.task.create({
        data: {
          pointId: body.pointId,
          type: body.type,
          productId: body.productId ?? null,
          description: body.description,
          priority: body.priority,
          dueDate: body.dueDate ?? null,
          notes: body.notes ?? null,
          createdById: me.id,
          assigneeId: body.assigneeId ?? null,
          assignedAt: body.assigneeId ? new Date() : null,
          status: body.assigneeId ? TaskStatus.ASIGNADA : TaskStatus.PENDIENTE,
        },
        include: listInclude,
      });
    });
    await audit(req, 'TASK_CREATED', 'Task', task.id, { pointId: task.pointId, type: task.type });
    if (task.assigneeId) {
      await audit(req, 'TASK_ASSIGNED', 'Task', task.id, { assigneeId: task.assigneeId });
      await notifyUsers([task.assigneeId], {
        type: 'TAREA_ASIGNADA',
        title: 'Nueva tarea asignada',
        message: `${task.point.name}: ${task.description}`,
        link: `/tareas/${task.id}`,
      });
    }
    res.status(201).json(task);
  }),
);

tasksRouter.put(
  '/:id',
  requireRole(Role.ADMIN, Role.SUPERVISOR),
  ah(async (req, res) => {
    const me = currentUser(req);
    const { id } = parse(idParam, req.params);
    const before = await loadTaskFor(me, id);
    const body = parse(taskBody.omit({ assigneeId: true }), req.body);
    await assertPointAccess(me, body.pointId);
    const task = await prisma.task.update({
      where: { id },
      data: {
        pointId: body.pointId,
        type: body.type,
        productId: body.productId ?? null,
        description: body.description,
        priority: body.priority,
        dueDate: body.dueDate ?? null,
        notes: body.notes ?? null,
        dueSoonNotifiedAt: body.dueDate?.getTime() !== before.dueDate?.getTime() ? null : before.dueSoonNotifiedAt,
      },
      include: listInclude,
    });
    await audit(req, 'TASK_UPDATED', 'Task', id);
    res.json(task);
  }),
);

tasksRouter.post(
  '/:id/assign',
  requireRole(Role.ADMIN, Role.SUPERVISOR),
  ah(async (req, res) => {
    const me = currentUser(req);
    const { id } = parse(idParam, req.params);
    const { assigneeId } = parse(z.object({ assigneeId: z.coerce.number().int().positive() }), req.body);
    const before = await loadTaskFor(me, id);
    if (before.status === TaskStatus.COMPLETADA || before.status === TaskStatus.CANCELADA) throw badRequest('La tarea ya está cerrada');
    if (before.assigneeId === assigneeId) throw badRequest('La tarea ya está asignada a ese usuario');
    const task = await prisma.$transaction(async (tx) => {
      await prepareAssignee(tx, me.companyId, assigneeId, before.pointId);
      const updated = await tx.task.update({
        where: { id },
        data: {
          assigneeId,
          assignedAt: new Date(),
          status: before.status === TaskStatus.PENDIENTE ? TaskStatus.ASIGNADA : before.status,
        },
        include: listInclude,
      });
      if (before.requirementId && before.status === TaskStatus.PENDIENTE) {
        await syncRequirement(tx, before.requirementId, RequirementStatus.ASIGNADO, assigneeId);
      } else if (before.requirementId) {
        await tx.requirement.update({ where: { id: before.requirementId }, data: { assigneeId } });
      }
      return updated;
    });
    const reassigned = Boolean(before.assigneeId);
    await audit(req, reassigned ? 'TASK_REASSIGNED' : 'TASK_ASSIGNED', 'Task', id, { from: before.assigneeId, to: assigneeId });
    await notifyUsers([assigneeId], {
      type: 'TAREA_ASIGNADA',
      title: reassigned ? 'Tarea reasignada a usted' : 'Nueva tarea asignada',
      message: `${task.point.name}: ${task.description}`,
      link: `/tareas/${id}`,
    });
    if (before.assigneeId) {
      await notifyUsers([before.assigneeId], {
        type: 'TAREA_REASIGNADA',
        title: 'Tarea reasignada',
        message: `La tarea #${id} (${task.point.name}) fue asignada a otro responsable`,
        link: `/tareas`,
      });
    }
    res.json(task);
  }),
);

tasksRouter.post(
  '/:id/start',
  ah(async (req, res) => {
    const me = currentUser(req);
    const { id } = parse(idParam, req.params);
    const body = parse(z.object({ latitude: z.number().optional(), longitude: z.number().optional() }), req.body ?? {});
    const before = await loadTaskFor(me, id);
    if (before.assigneeId !== me.id && !isManager(me)) throw forbidden();
    if (before.status !== TaskStatus.ASIGNADA && before.status !== TaskStatus.PENDIENTE) throw badRequest('Solo se pueden iniciar tareas pendientes o asignadas');
    if (!before.assigneeId) throw badRequest('Asigne un responsable antes de iniciar la tarea');
    const task = await prisma.$transaction(async (tx) => {
      const updated = await tx.task.update({
        where: { id },
        data: { status: TaskStatus.EN_PROCESO, startedAt: new Date(), startLatitude: body.latitude ?? null, startLongitude: body.longitude ?? null },
        include: listInclude,
      });
      await syncRequirement(tx, before.requirementId, RequirementStatus.EN_PROCESO);
      return updated;
    });
    await audit(req, 'TASK_STARTED', 'Task', id);
    res.json(task);
  }),
);

tasksRouter.post(
  '/:id/complete',
  ah(async (req, res) => {
    const me = currentUser(req);
    const { id } = parse(idParam, req.params);
    const { notes } = parse(z.object({ notes: optionalText }), req.body ?? {});
    const before = await loadTaskFor(me, id);
    if (before.assigneeId !== me.id && !isManager(me)) throw forbidden();
    if (before.status !== TaskStatus.EN_PROCESO && before.status !== TaskStatus.ASIGNADA) throw badRequest('Solo se pueden completar tareas asignadas o en proceso');
    const [fillings, photos, settings] = await Promise.all([
      prisma.filling.count({ where: { taskId: id } }),
      prisma.photo.count({ where: { taskId: id } }),
      getSettings(me.companyId),
    ]);
    if (before.type === 'LLENADO' && fillings === 0) throw badRequest('Registre al menos un llenado (cantidad realmente llenada) antes de completar la tarea');
    if (settings.requirePhotoOnComplete === 'true' && photos === 0) throw badRequest('Adjunte al menos una fotografía antes de completar la tarea');
    const task = await prisma.$transaction(async (tx) => {
      const updated = await tx.task.update({
        where: { id },
        data: {
          status: TaskStatus.COMPLETADA,
          completedAt: new Date(),
          startedAt: before.startedAt ?? new Date(),
          notes: notes ? [before.notes, notes].filter(Boolean).join('\n') : before.notes,
        },
        include: listInclude,
      });
      await syncRequirement(tx, before.requirementId, RequirementStatus.COMPLETADO);
      return updated;
    });
    await audit(req, 'TASK_COMPLETED', 'Task', id);
    await notifyUsers((await pointManagerIds(task.pointId)).filter((u) => u !== me.id), {
      type: 'TAREA_COMPLETADA',
      title: 'Tarea completada',
      message: `${task.point.name}: ${task.description} — ${me.name}`,
      link: `/tareas/${id}`,
    });
    res.json(task);
  }),
);

tasksRouter.post(
  '/:id/cancel',
  requireRole(Role.ADMIN, Role.SUPERVISOR),
  ah(async (req, res) => {
    const me = currentUser(req);
    const { id } = parse(idParam, req.params);
    const { reason } = parse(z.object({ reason: z.string().trim().min(3, 'Indique el motivo').max(1000) }), req.body);
    const before = await loadTaskFor(me, id);
    if (!OPEN.includes(before.status)) throw badRequest('La tarea ya está cerrada');
    const task = await prisma.$transaction(async (tx) => {
      const updated = await tx.task.update({
        where: { id },
        data: { status: TaskStatus.CANCELADA, notes: [before.notes, `Cancelada: ${reason}`].filter(Boolean).join('\n') },
        include: listInclude,
      });
      await syncRequirement(tx, before.requirementId, RequirementStatus.PENDIENTE);
      return updated;
    });
    await audit(req, 'TASK_CANCELLED', 'Task', id, { reason });
    if (before.assigneeId) {
      await notifyUsers([before.assigneeId], { type: 'TAREA_CANCELADA', title: 'Tarea cancelada', message: `#${id} ${await getPointName(before.pointId)}: ${reason}`, link: `/tareas/${id}` });
    }
    res.json(task);
  }),
);
