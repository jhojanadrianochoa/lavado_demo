import { Router } from 'express';
import { IncidentStatus, Priority, Prisma, Role } from '@prisma/client';
import { z } from 'zod';
import type { AuthUser } from '../lib/auth.js';
import { audit } from '../lib/audit.js';
import { INCIDENT_TYPES } from '../lib/catalogs.js';
import { ah, badRequest, forbidden, notFound } from '../lib/errors.js';
import { notifyUsers, pointManagerIds } from '../lib/notifications.js';
import { prisma } from '../lib/prisma.js';
import { dateRange, idParam, listQuery, optionalFk, optionalText, paginate, parse } from '../lib/query.js';
import { accessiblePointIds, assertPointAccess, isManager, pointFilter } from '../lib/scope.js';
import { currentUser, requireRole } from '../middleware/auth.js';

export const incidentsRouter = Router();

const userMini = { select: { id: true, name: true, username: true } } as const;
const include = {
  point: { select: { id: true, name: true, code: true } },
  task: { select: { id: true, description: true, status: true } },
  reportedBy: userMini,
  assignee: userMini,
  _count: { select: { photos: true } },
} satisfies Prisma.IncidentInclude;

async function loadIncidentFor(user: AuthUser, id: number) {
  const incident = await prisma.incident.findUnique({ where: { id } });
  if (!incident) throw notFound('Incidencia no encontrada');
  if (user.role === Role.WORKER) {
    if (incident.reportedById !== user.id && incident.assigneeId !== user.id) throw forbidden();
  } else {
    await assertPointAccess(user, incident.pointId);
  }
  return incident;
}

incidentsRouter.get(
  '/',
  ah(async (req, res) => {
    const me = currentUser(req);
    const q = parse(listQuery.extend({ open: z.enum(['true']).optional(), taskId: z.coerce.number().int().positive().optional() }), req.query);
    const where: Prisma.IncidentWhereInput = { ...(await pointFilter(me, q.pointId)) };
    if (me.role === Role.WORKER) where.OR = [{ reportedById: me.id }, { assigneeId: me.id }];
    else if (q.userId) where.OR = [{ reportedById: q.userId }, { assigneeId: q.userId }];
    if (q.status) where.status = q.status as IncidentStatus;
    else if (q.open) where.status = { in: [IncidentStatus.ABIERTA, IncidentStatus.EN_PROCESO] };
    if (q.type) where.type = q.type;
    if (q.priority) where.priority = q.priority as Priority;
    if (q.taskId) where.taskId = q.taskId;
    const range = dateRange(q.from, q.to);
    if (range) where.createdAt = range;
    if (q.q) where.description = { contains: q.q, mode: 'insensitive' };
    const [items, total] = await Promise.all([
      prisma.incident.findMany({ where, include, orderBy: { createdAt: 'desc' }, ...paginate(q) }),
      prisma.incident.count({ where }),
    ]);
    res.json({ items, total, page: q.page, pageSize: q.pageSize });
  }),
);

incidentsRouter.get(
  '/:id',
  ah(async (req, res) => {
    const me = currentUser(req);
    const { id } = parse(idParam, req.params);
    await loadIncidentFor(me, id);
    res.json(
      await prisma.incident.findUniqueOrThrow({
        where: { id },
        include: { ...include, photos: { include: { user: userMini }, orderBy: { takenAt: 'desc' } } },
      }),
    );
  }),
);

incidentsRouter.post(
  '/',
  ah(async (req, res) => {
    const me = currentUser(req);
    const body = parse(
      z.object({
        pointId: optionalFk,
        taskId: optionalFk,
        type: z.enum(INCIDENT_TYPES),
        description: z.string().trim().min(3, 'Describa el problema').max(2000),
        priority: z.nativeEnum(Priority).default(Priority.MEDIA),
      }),
      req.body,
    );
    let pointId = body.pointId ?? null;
    if (body.taskId) {
      const task = await prisma.task.findUnique({ where: { id: body.taskId } });
      if (!task) throw notFound('Tarea no encontrada');
      if (me.role === Role.WORKER && task.assigneeId !== me.id) throw forbidden('Esta tarea no está asignada a usted');
      pointId = task.pointId;
    }
    if (!pointId) throw badRequest('Seleccione el punto de lavado');
    const ids = await accessiblePointIds(me);
    if (ids && !ids.includes(pointId)) throw forbidden('No tiene acceso a este punto');
    const incident = await prisma.incident.create({
      data: { pointId, taskId: body.taskId ?? null, type: body.type, description: body.description, priority: body.priority, reportedById: me.id },
      include,
    });
    await audit(req, 'INCIDENT_CREATED', 'Incident', incident.id, { pointId, type: incident.type });
    await notifyUsers((await pointManagerIds(pointId)).filter((u) => u !== me.id), {
      type: 'INCIDENCIA_NUEVA',
      title: 'Nueva incidencia',
      message: `${incident.point.name}: ${incident.description}`,
      link: `/incidencias/${incident.id}`,
    });
    res.status(201).json(incident);
  }),
);

incidentsRouter.put(
  '/:id',
  requireRole(Role.ADMIN, Role.SUPERVISOR),
  ah(async (req, res) => {
    const me = currentUser(req);
    const { id } = parse(idParam, req.params);
    const before = await loadIncidentFor(me, id);
    const body = parse(
      z.object({
        type: z.enum(INCIDENT_TYPES),
        description: z.string().trim().min(3).max(2000),
        priority: z.nativeEnum(Priority),
        assigneeId: optionalFk,
      }),
      req.body,
    );
    if (body.assigneeId) {
      const assignee = await prisma.user.findFirst({ where: { id: body.assigneeId, companyId: me.companyId, active: true } });
      if (!assignee) throw badRequest('Responsable inválido o inactivo');
    }
    const incident = await prisma.incident.update({
      where: { id },
      data: { type: body.type, description: body.description, priority: body.priority, assigneeId: body.assigneeId ?? null },
      include,
    });
    await audit(req, 'INCIDENT_UPDATED', 'Incident', id, { assigneeFrom: before.assigneeId, assigneeTo: incident.assigneeId });
    if (incident.assigneeId && incident.assigneeId !== before.assigneeId) {
      await notifyUsers([incident.assigneeId], {
        type: 'INCIDENCIA_ASIGNADA',
        title: 'Incidencia asignada para solucionar',
        message: `${incident.point.name}: ${incident.description}`,
        link: `/incidencias/${id}`,
      });
    }
    res.json(incident);
  }),
);

incidentsRouter.patch(
  '/:id/status',
  ah(async (req, res) => {
    const me = currentUser(req);
    const { id } = parse(idParam, req.params);
    const before = await loadIncidentFor(me, id);
    const body = parse(z.object({ status: z.nativeEnum(IncidentStatus), solution: optionalText }), req.body);
    const isAssignee = before.assigneeId === me.id;
    if (!isManager(me) && !isAssignee) throw forbidden();
    if (!isManager(me) && body.status === IncidentStatus.CERRADA) throw forbidden('Solo administradores o supervisores pueden cerrar incidencias');
    if (body.status === IncidentStatus.SOLUCIONADA && !body.solution && !before.solution) throw badRequest('Describa la solución aplicada');
    const now = new Date();
    const incident = await prisma.incident.update({
      where: { id },
      data: {
        status: body.status,
        solution: body.solution ?? before.solution,
        resolvedAt: body.status === IncidentStatus.SOLUCIONADA || body.status === IncidentStatus.CERRADA ? (before.resolvedAt ?? now) : null,
        closedAt: body.status === IncidentStatus.CERRADA ? now : null,
        assigneeId: before.assigneeId ?? (body.status === IncidentStatus.EN_PROCESO ? me.id : null),
      },
      include,
    });
    const action = body.status === IncidentStatus.CERRADA ? 'INCIDENT_CLOSED' : body.status === IncidentStatus.SOLUCIONADA ? 'INCIDENT_RESOLVED' : 'INCIDENT_STATUS';
    await audit(req, action, 'Incident', id, { from: before.status, to: body.status, solution: body.solution ?? undefined });
    if (body.status === IncidentStatus.SOLUCIONADA && before.status !== IncidentStatus.SOLUCIONADA) {
      const recipients = [before.reportedById, ...(await pointManagerIds(before.pointId))].filter((u) => u !== me.id);
      await notifyUsers(recipients, {
        type: 'INCIDENCIA_SOLUCIONADA',
        title: 'Incidencia solucionada',
        message: `${incident.point.name}: ${incident.solution ?? ''}`,
        link: `/incidencias/${id}`,
      });
    }
    res.json(incident);
  }),
);

