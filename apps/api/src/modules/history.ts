import { Router } from 'express';
import { IncidentStatus, Prisma, RequirementStatus, Role, TaskStatus } from '@prisma/client';
import { z } from 'zod';
import { ah } from '../lib/errors.js';
import { prisma } from '../lib/prisma.js';
import { dateRange, listQuery, parse } from '../lib/query.js';
import { pointFilter } from '../lib/scope.js';
import { currentUser } from '../middleware/auth.js';

export const historyRouter = Router();

const KINDS = ['TAREA', 'REQUERIMIENTO', 'LLENADO', 'INCIDENCIA', 'INVENTARIO', 'FOTO'] as const;
type Kind = (typeof KINDS)[number];

export interface HistoryEntry {
  kind: Kind;
  id: number;
  date: Date;
  title: string;
  detail: string;
  status?: string;
  point?: { id: number; name: string } | null;
  user?: { id: number; name: string } | null;
  quantity?: number;
  unit?: string;
  product?: string;
  link?: string;
  photoId?: number;
}

historyRouter.get(
  '/',
  ah(async (req, res) => {
    const me = currentUser(req);
    const q = parse(
      listQuery.extend({
        kind: z.enum(KINDS).optional(),
        taskType: z.preprocess((v) => (v === '' ? undefined : v), z.string().optional()),
        incidentType: z.preprocess((v) => (v === '' ? undefined : v), z.string().optional()),
      }),
      req.query,
    );
    const scope = await pointFilter(me, q.pointId);
    const range = dateRange(q.from, q.to);
    const worker = me.role === Role.WORKER;
    const uid = worker ? me.id : q.userId;
    const take = q.page * q.pageSize;
    const want = (k: Kind) => !q.kind || q.kind === k;
    const pointSel = { select: { id: true, name: true } } as const;
    const userSel = { select: { id: true, name: true } } as const;

    const taskWhere: Prisma.TaskWhereInput = {
      ...scope,
      ...(uid ? { assigneeId: uid } : {}),
      ...(q.taskType ? { type: q.taskType } : {}),
      ...(q.status && (Object.values(TaskStatus) as string[]).includes(q.status) ? { status: q.status as TaskStatus } : {}),
      ...(q.productId ? { productId: q.productId } : {}),
      ...(range ? { updatedAt: range } : {}),
    };
    const reqWhere: Prisma.RequirementWhereInput = {
      ...scope,
      ...(uid ? { OR: [{ createdById: uid }, { assigneeId: uid }] } : {}),
      ...(q.status && (Object.values(RequirementStatus) as string[]).includes(q.status) ? { status: q.status as RequirementStatus } : {}),
      ...(q.productId ? { productId: q.productId } : {}),
      ...(range ? { createdAt: range } : {}),
    };
    const fillWhere: Prisma.FillingWhereInput = {
      ...scope,
      ...(uid ? { userId: uid } : {}),
      ...(q.productId ? { productId: q.productId } : {}),
      ...(q.taskType ? { task: { type: q.taskType } } : {}),
      ...(range ? { filledAt: range } : {}),
    };
    const incWhere: Prisma.IncidentWhereInput = {
      ...scope,
      ...(uid ? { OR: [{ reportedById: uid }, { assigneeId: uid }] } : {}),
      ...(q.incidentType ? { type: q.incidentType } : {}),
      ...(q.status && (Object.values(IncidentStatus) as string[]).includes(q.status) ? { status: q.status as IncidentStatus } : {}),
      ...(range ? { createdAt: range } : {}),
    };
    const movWhere: Prisma.InventoryMovementWhereInput = {
      ...(scope.pointId ? { pointId: scope.pointId } : {}),
      product: { companyId: me.companyId },
      ...(uid ? { userId: uid } : {}),
      ...(q.productId ? { productId: q.productId } : {}),
      ...(range ? { createdAt: range } : {}),
    };
    const photoWhere: Prisma.PhotoWhereInput = {
      ...scope,
      ...(uid ? { userId: uid } : {}),
      ...(range ? { takenAt: range } : {}),
    };

    const statusFilter = Boolean(q.status);
    const productFilter = Boolean(q.productId);
    const [tasks, reqs, fills, incs, movs, photos] = await Promise.all([
      want('TAREA') && !q.incidentType
        ? prisma.task.findMany({ where: taskWhere, include: { point: pointSel, assignee: userSel }, orderBy: { updatedAt: 'desc' }, take })
        : [],
      want('REQUERIMIENTO') && !q.taskType && !q.incidentType
        ? prisma.requirement.findMany({ where: reqWhere, include: { point: pointSel, createdBy: userSel }, orderBy: { createdAt: 'desc' }, take })
        : [],
      want('LLENADO') && !statusFilter && !q.incidentType
        ? prisma.filling.findMany({ where: fillWhere, include: { point: pointSel, user: userSel, product: { select: { name: true } } }, orderBy: { filledAt: 'desc' }, take })
        : [],
      want('INCIDENCIA') && !productFilter && !q.taskType
        ? prisma.incident.findMany({ where: incWhere, include: { point: pointSel, reportedBy: userSel }, orderBy: { createdAt: 'desc' }, take })
        : [],
      want('INVENTARIO') && !statusFilter && !q.taskType && !q.incidentType && !worker && (!q.pointId || scope.pointId)
        ? prisma.inventoryMovement.findMany({ where: movWhere, include: { point: pointSel, user: userSel, product: { select: { name: true, unit: true } } }, orderBy: { createdAt: 'desc' }, take })
        : [],
      want('FOTO') && !statusFilter && !productFilter && !q.taskType && !q.incidentType
        ? prisma.photo.findMany({ where: photoWhere, include: { point: pointSel, user: userSel }, orderBy: { takenAt: 'desc' }, take })
        : [],
    ]);

    const entries: HistoryEntry[] = [
      ...tasks.map((t) => ({ kind: 'TAREA' as const, id: t.id, date: t.completedAt ?? t.startedAt ?? t.updatedAt, title: `Tarea #${t.id} · ${t.type}`, detail: t.description, status: t.status, point: t.point, user: t.assignee, link: `/tareas/${t.id}` })),
      ...reqs.map((r) => ({ kind: 'REQUERIMIENTO' as const, id: r.id, date: r.createdAt, title: `Requerimiento #${r.id} · ${r.type}`, detail: r.description, status: r.status, point: r.point, user: r.createdBy, link: `/requerimientos?id=${r.id}` })),
      ...fills.map((f) => ({ kind: 'LLENADO' as const, id: f.id, date: f.filledAt, title: `Llenado de ${f.product.name}`, detail: f.notes ?? '', point: f.point, user: f.user, quantity: f.quantity, unit: f.unit, product: f.product.name, link: f.taskId ? `/tareas/${f.taskId}` : undefined })),
      ...incs.map((i) => ({ kind: 'INCIDENCIA' as const, id: i.id, date: i.createdAt, title: `Incidencia #${i.id} · ${i.type}`, detail: i.description, status: i.status, point: i.point, user: i.reportedBy, link: `/incidencias/${i.id}` })),
      ...movs.map((m) => ({ kind: 'INVENTARIO' as const, id: m.id, date: m.createdAt, title: `Inventario · ${m.type} · ${m.product.name}`, detail: `${m.reason ?? ''} (saldo ${m.balanceAfter} ${m.product.unit})`, point: m.point, user: m.user, quantity: m.quantity, unit: m.product.unit, product: m.product.name })),
      ...photos.map((p) => ({ kind: 'FOTO' as const, id: p.id, date: p.takenAt, title: `Foto ${p.type}`, detail: p.caption ?? '', point: p.point, user: p.user, photoId: p.id, link: p.taskId ? `/tareas/${p.taskId}` : p.incidentId ? `/incidencias/${p.incidentId}` : undefined })),
    ].sort((a, b) => b.date.getTime() - a.date.getTime());

    const start = (q.page - 1) * q.pageSize;
    res.json({ items: entries.slice(start, start + q.pageSize), hasMore: entries.length > start + q.pageSize, page: q.page, pageSize: q.pageSize });
  }),
);
