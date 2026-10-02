import { Router } from 'express';
import { MovementType, Prisma, Role } from '@prisma/client';
import { z } from 'zod';
import { audit } from '../lib/audit.js';
import { ah, notFound } from '../lib/errors.js';
import { notifyLowStock } from '../lib/notifications.js';
import { prisma } from '../lib/prisma.js';
import { dateRange, listQuery, optionalFk, paginate, parse } from '../lib/query.js';
import { currentUser, requireRole } from '../middleware/auth.js';
import { applyMovement } from './inventoryService.js';

export const inventoryRouter = Router();

inventoryRouter.get(
  '/movements',
  requireRole(Role.ADMIN, Role.SUPERVISOR),
  ah(async (req, res) => {
    const me = currentUser(req);
    const q = parse(listQuery, req.query);
    const where: Prisma.InventoryMovementWhereInput = { product: { companyId: me.companyId } };
    if (q.productId) where.productId = q.productId;
    if (q.pointId) where.pointId = q.pointId;
    if (q.userId) where.userId = q.userId;
    if (q.type) where.type = q.type as MovementType;
    const range = dateRange(q.from, q.to);
    if (range) where.createdAt = range;
    if (q.q) where.reason = { contains: q.q, mode: 'insensitive' };
    const [items, total] = await Promise.all([
      prisma.inventoryMovement.findMany({
        where,
        include: {
          product: { select: { id: true, name: true, unit: true } },
          user: { select: { id: true, name: true } },
          point: { select: { id: true, name: true, code: true } },
        },
        orderBy: { createdAt: 'desc' },
        ...paginate(q),
      }),
      prisma.inventoryMovement.count({ where }),
    ]);
    res.json({ items, total, page: q.page, pageSize: q.pageSize });
  }),
);

inventoryRouter.post(
  '/movements',
  requireRole(Role.ADMIN),
  ah(async (req, res) => {
    const me = currentUser(req);
    const body = parse(
      z.object({
        productId: z.coerce.number().int().positive(),
        type: z.enum([MovementType.ENTRADA, MovementType.SALIDA, MovementType.AJUSTE]),
        quantity: z.coerce.number().min(0, 'Cantidad inválida'),
        reason: z.string().trim().min(2, 'Indique el motivo').max(500),
        pointId: optionalFk,
      }),
      req.body,
    );
    const product = await prisma.product.findFirst({ where: { id: body.productId, companyId: me.companyId } });
    if (!product) throw notFound('Producto no encontrado');
    const movement = await prisma.$transaction((tx) => applyMovement(tx, { ...body, userId: me.id }));
    await audit(req, 'INVENTORY_MOVEMENT', 'Product', product.id, { movementId: movement.id, type: body.type, quantity: body.quantity, reason: body.reason, balanceAfter: movement.balanceAfter });
    await notifyLowStock(product.id);
    res.status(201).json(movement);
  }),
);

inventoryRouter.get(
  '/alerts',
  ah(async (req, res) => {
    const me = currentUser(req);
    const products = await prisma.product.findMany({ where: { companyId: me.companyId, active: true }, orderBy: { name: 'asc' } });
    res.json(products.filter((p) => p.currentStock <= p.minStock));
  }),
);
