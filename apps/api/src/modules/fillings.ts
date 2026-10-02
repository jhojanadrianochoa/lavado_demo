import { Router } from 'express';
import { MovementType, Prisma, Role, TaskStatus } from '@prisma/client';
import { z } from 'zod';
import { audit } from '../lib/audit.js';
import { ah, badRequest, forbidden, notFound } from '../lib/errors.js';
import { notifyLowStock } from '../lib/notifications.js';
import { prisma } from '../lib/prisma.js';
import { dateRange, idParam, listQuery, optionalDateTime, optionalFk, optionalText, paginate, parse } from '../lib/query.js';
import { getSettings } from '../lib/settings.js';
import { assertPointAccess, pointFilter } from '../lib/scope.js';
import { currentUser } from '../middleware/auth.js';
import { applyMovement } from './inventoryService.js';

export const fillingsRouter = Router();

const userMini = { select: { id: true, name: true, username: true } } as const;
const include = {
  point: { select: { id: true, name: true, code: true } },
  product: { select: { id: true, name: true, unit: true } },
  user: userMini,
  task: { select: { id: true, description: true, status: true } },
  photos: { select: { id: true, type: true, takenAt: true } },
  movement: { select: { id: true, balanceAfter: true } },
} satisfies Prisma.FillingInclude;

fillingsRouter.get(
  '/',
  ah(async (req, res) => {
    const me = currentUser(req);
    const q = parse(listQuery.extend({ taskId: z.coerce.number().int().positive().optional() }), req.query);
    const where: Prisma.FillingWhereInput = { ...(await pointFilter(me, q.pointId)) };
    if (me.role === Role.WORKER) where.userId = me.id;
    else if (q.userId) where.userId = q.userId;
    if (q.productId) where.productId = q.productId;
    if (q.taskId) where.taskId = q.taskId;
    const range = dateRange(q.from, q.to);
    if (range) where.filledAt = range;
    if (q.q) where.OR = [{ notes: { contains: q.q, mode: 'insensitive' } }, { point: { name: { contains: q.q, mode: 'insensitive' } } }, { product: { name: { contains: q.q, mode: 'insensitive' } } }];
    const [items, total, sum] = await Promise.all([
      prisma.filling.findMany({ where, include, orderBy: { filledAt: 'desc' }, ...paginate(q) }),
      prisma.filling.count({ where }),
      prisma.filling.groupBy({ by: ['unit'], where, _sum: { quantity: true } }),
    ]);
    res.json({ items, total, page: q.page, pageSize: q.pageSize, totals: sum.map((s) => ({ unit: s.unit, quantity: s._sum.quantity ?? 0 })) });
  }),
);

fillingsRouter.get(
  '/:id',
  ah(async (req, res) => {
    const me = currentUser(req);
    const { id } = parse(idParam, req.params);
    const item = await prisma.filling.findUnique({ where: { id }, include });
    if (!item) throw notFound('Llenado no encontrado');
    if (me.role === Role.WORKER && item.userId !== me.id) throw forbidden();
    await assertPointAccess(me, item.pointId);
    res.json(item);
  }),
);

/** Registra la cantidad REALMENTE llenada y descuenta el inventario general. */
fillingsRouter.post(
  '/',
  ah(async (req, res) => {
    const me = currentUser(req);
    const body = parse(
      z.object({
        taskId: optionalFk,
        pointId: optionalFk,
        productId: z.coerce.number().int().positive({ message: 'Seleccione el producto' }),
        quantity: z.coerce.number().positive('La cantidad llenada debe ser mayor que 0').max(100000),
        filledAt: optionalDateTime,
        notes: optionalText,
      }),
      req.body,
    );
    let pointId = body.pointId ?? null;
    let taskStatus: TaskStatus | null = null;
    if (body.taskId) {
      const task = await prisma.task.findUnique({ where: { id: body.taskId } });
      if (!task) throw notFound('Tarea no encontrada');
      if (me.role === Role.WORKER && task.assigneeId !== me.id) throw forbidden('Esta tarea no está asignada a usted');
      if (task.status === TaskStatus.COMPLETADA || task.status === TaskStatus.CANCELADA) throw badRequest('La tarea ya está cerrada');
      pointId = task.pointId;
      taskStatus = task.status;
    }
    if (!pointId) throw badRequest('Seleccione el punto de lavado');
    await assertPointAccess(me, pointId);
    const product = await prisma.product.findFirst({ where: { id: body.productId, companyId: me.companyId } });
    if (!product) throw notFound('Producto no encontrado');
    if (!product.active) throw badRequest('El producto está inactivo');
    if (body.filledAt && body.filledAt.getTime() > Date.now() + 5 * 60 * 1000) throw badRequest('La fecha del llenado no puede ser futura');
    const settings = await getSettings(me.companyId);
    const filling = await prisma.$transaction(async (tx) => {
      const created = await tx.filling.create({
        data: {
          pointId: pointId!,
          productId: product.id,
          taskId: body.taskId ?? null,
          userId: me.id,
          quantity: body.quantity,
          unit: product.unit,
          filledAt: body.filledAt ?? new Date(),
          notes: body.notes ?? null,
        },
      });
      if (settings.autoDeductInventory === 'true') {
        await applyMovement(tx, {
          productId: product.id,
          type: MovementType.LLENADO,
          quantity: body.quantity,
          userId: me.id,
          pointId,
          fillingId: created.id,
          reason: body.taskId ? `Llenado tarea #${body.taskId}` : 'Llenado en punto',
        });
      }
      if (body.taskId && (taskStatus === TaskStatus.ASIGNADA || taskStatus === TaskStatus.PENDIENTE)) {
        await tx.task.update({ where: { id: body.taskId }, data: { status: TaskStatus.EN_PROCESO, startedAt: new Date() } });
      }
      return tx.filling.findUniqueOrThrow({ where: { id: created.id }, include });
    });
    await audit(req, 'FILLING_REGISTERED', 'Filling', filling.id, { pointId, productId: product.id, quantity: body.quantity, unit: product.unit, taskId: body.taskId ?? null });
    await notifyLowStock(product.id);
    res.status(201).json(filling);
  }),
);
