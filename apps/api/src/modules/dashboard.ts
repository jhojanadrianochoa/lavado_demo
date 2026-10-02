import { Router } from 'express';
import { IncidentStatus, Prisma, Role, TaskStatus } from '@prisma/client';
import { ah } from '../lib/errors.js';
import { prisma } from '../lib/prisma.js';
import { dateRange, listQuery, parse } from '../lib/query.js';
import { accessiblePointIds, pointFilter } from '../lib/scope.js';
import { currentUser, requireRole } from '../middleware/auth.js';

export const dashboardRouter = Router();

function defaultRange(from?: string, to?: string) {
  const today = new Date();
  const fmt = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const start = new Date(today);
  start.setDate(start.getDate() - 29);
  return { from: from ?? fmt(start), to: to ?? fmt(today) };
}

dashboardRouter.get(
  '/',
  requireRole(Role.ADMIN, Role.SUPERVISOR),
  ah(async (req, res) => {
    const me = currentUser(req);
    const q = parse(listQuery, req.query);
    const { from, to } = defaultRange(q.from, q.to);
    const range = dateRange(from, to)!;
    const scope = await pointFilter(me, q.pointId);
    const ids = await accessiblePointIds(me);

    const pointWhere: Prisma.WashPointWhereInput = { companyId: me.companyId, ...(ids ? { id: { in: ids } } : {}), ...(q.pointId ? { id: q.pointId } : {}) };
    const taskWhere: Prisma.TaskWhereInput = { ...scope, ...(q.userId ? { assigneeId: q.userId } : {}), ...(q.productId ? { productId: q.productId } : {}) };
    const incidentWhere: Prisma.IncidentWhereInput = { ...scope, ...(q.userId ? { OR: [{ reportedById: q.userId }, { assigneeId: q.userId }] } : {}) };
    const fillingWhere: Prisma.FillingWhereInput = { ...scope, filledAt: range, ...(q.userId ? { userId: q.userId } : {}), ...(q.productId ? { productId: q.productId } : {}) };

    const [totalPoints, activePoints, tasksByStatus, completedInPeriod, incidentsByStatus, products, byProduct, byPoint, fillingsInPeriod] = await Promise.all([
      prisma.washPoint.count({ where: pointWhere }),
      prisma.washPoint.count({ where: { ...pointWhere, active: true } }),
      prisma.task.groupBy({ by: ['status'], where: { ...taskWhere, createdAt: range }, _count: true }),
      prisma.task.count({ where: { ...taskWhere, status: TaskStatus.COMPLETADA, completedAt: range } }),
      prisma.incident.groupBy({ by: ['status'], where: { ...incidentWhere, createdAt: range }, _count: true }),
      prisma.product.findMany({ where: { companyId: me.companyId }, select: { id: true, name: true, unit: true, currentStock: true, minStock: true, active: true } }),
      prisma.filling.groupBy({ by: ['productId', 'unit'], where: fillingWhere, _sum: { quantity: true } }),
      prisma.filling.groupBy({ by: ['pointId', 'unit'], where: fillingWhere, _sum: { quantity: true } }),
      prisma.filling.findMany({ where: fillingWhere, select: { filledAt: true, quantity: true, unit: true } }),
    ]);

    const [openTasks, openIncidents] = await Promise.all([
      prisma.task.groupBy({ by: ['status'], where: { ...taskWhere, status: { in: [TaskStatus.PENDIENTE, TaskStatus.ASIGNADA, TaskStatus.EN_PROCESO] } }, _count: true }),
      prisma.incident.groupBy({ by: ['status'], where: { ...incidentWhere, status: { in: [IncidentStatus.ABIERTA, IncidentStatus.EN_PROCESO] } }, _count: true }),
    ]);
    const countOf = (rows: { status: string; _count: number }[], ...statuses: string[]) => rows.filter((r) => statuses.includes(r.status)).reduce((a, r) => a + r._count, 0);

    const pointNames = await prisma.washPoint.findMany({ where: { id: { in: byPoint.map((b) => b.pointId) } }, select: { id: true, name: true } });
    const lowStock = products.filter((p) => p.active && p.currentStock <= p.minStock);

    const days = (range.lte!.getTime() - range.gte!.getTime()) / 86400000;
    const byMonth = days > 62;
    const periodMap = new Map<string, number>();
    const cursor = new Date(range.gte!);
    while (cursor <= range.lte!) {
      const key = byMonth ? `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}` : `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}-${String(cursor.getDate()).padStart(2, '0')}`;
      periodMap.set(key, 0);
      if (byMonth) cursor.setMonth(cursor.getMonth() + 1, 1);
      else cursor.setDate(cursor.getDate() + 1);
    }
    let litersInPeriod = 0;
    for (const f of fillingsInPeriod) {
      const d = f.filledAt;
      const key = byMonth ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}` : `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      periodMap.set(key, (periodMap.get(key) ?? 0) + f.quantity);
      if (f.unit === 'L') litersInPeriod += f.quantity;
    }

    res.json({
      period: { from, to, granularity: byMonth ? 'month' : 'day' },
      kpis: {
        totalPoints,
        activePoints,
        tasksPending: countOf(openTasks, TaskStatus.PENDIENTE, TaskStatus.ASIGNADA),
        tasksInProgress: countOf(openTasks, TaskStatus.EN_PROCESO),
        tasksCompleted: completedInPeriod,
        incidentsOpen: countOf(openIncidents, IncidentStatus.ABIERTA),
        incidentsInProgress: countOf(openIncidents, IncidentStatus.EN_PROCESO),
        lowStockProducts: lowStock.length,
        litersInPeriod: Math.round(litersInPeriod * 100) / 100,
        fillingsInPeriod: fillingsInPeriod.length,
      },
      lowStock,
      consumptionByProduct: byProduct.map((b) => ({ name: products.find((p) => p.id === b.productId)?.name ?? '', unit: b.unit, quantity: Math.round((b._sum.quantity ?? 0) * 100) / 100 })),
      consumptionByPoint: byPoint
        .map((b) => ({ name: pointNames.find((p) => p.id === b.pointId)?.name ?? '', unit: b.unit, quantity: Math.round((b._sum.quantity ?? 0) * 100) / 100 }))
        .sort((a, b) => b.quantity - a.quantity),
      tasksByStatus: tasksByStatus.map((t) => ({ status: t.status, count: t._count })),
      incidentsByStatus: incidentsByStatus.map((t) => ({ status: t.status, count: t._count })),
      consumptionByPeriod: [...periodMap.entries()].map(([period, quantity]) => ({ period, quantity: Math.round(quantity * 100) / 100 })),
    });
  }),
);
