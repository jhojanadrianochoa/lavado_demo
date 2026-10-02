import { Router } from 'express';
import { MovementType, Prisma, Role } from '@prisma/client';
import { z } from 'zod';
import { audit } from '../lib/audit.js';
import { ah, notFound } from '../lib/errors.js';
import { notifyLowStock } from '../lib/notifications.js';
import { prisma } from '../lib/prisma.js';
import { idParam, listQuery, optionalText, paginate, parse } from '../lib/query.js';
import { currentUser, requireRole } from '../middleware/auth.js';
import { applyMovement } from './inventoryService.js';

export const productsRouter = Router();

const productBody = z.object({
  name: z.string().trim().min(2).max(80),
  description: optionalText,
  unit: z.string().trim().min(1).max(20).default('L'),
  minStock: z.coerce.number().min(0).default(0),
  active: z.boolean().optional(),
});

productsRouter.get(
  '/',
  ah(async (req, res) => {
    const me = currentUser(req);
    const q = parse(listQuery.extend({ active: z.enum(['true', 'false']).optional(), lowStock: z.enum(['true']).optional() }), req.query);
    const where: Prisma.ProductWhereInput = { companyId: me.companyId };
    if (q.active) where.active = q.active === 'true';
    if (q.q) where.name = { contains: q.q, mode: 'insensitive' };
    let items = await prisma.product.findMany({ where, orderBy: { name: 'asc' } });
    if (q.lowStock) items = items.filter((p) => p.currentStock <= p.minStock);
    const total = items.length;
    const { skip, take } = paginate(q);
    res.json({ items: items.slice(skip, skip + take), total, page: q.page, pageSize: q.pageSize });
  }),
);

productsRouter.get(
  '/:id',
  ah(async (req, res) => {
    const { id } = parse(idParam, req.params);
    const product = await prisma.product.findFirst({ where: { id, companyId: currentUser(req).companyId } });
    if (!product) throw notFound('Producto no encontrado');
    res.json(product);
  }),
);

productsRouter.post(
  '/',
  requireRole(Role.ADMIN),
  ah(async (req, res) => {
    const me = currentUser(req);
    const body = parse(productBody.extend({ initialStock: z.coerce.number().min(0).default(0) }), req.body);
    const product = await prisma.$transaction(async (tx) => {
      const created = await tx.product.create({
        data: { companyId: me.companyId, name: body.name, description: body.description ?? null, unit: body.unit, minStock: body.minStock, active: body.active ?? true },
      });
      if (body.initialStock > 0) {
        await applyMovement(tx, { productId: created.id, type: MovementType.ENTRADA, quantity: body.initialStock, userId: me.id, reason: 'Inventario inicial' });
      }
      return tx.product.findUniqueOrThrow({ where: { id: created.id } });
    });
    await audit(req, 'PRODUCT_CREATED', 'Product', product.id, { name: product.name, initialStock: body.initialStock });
    await notifyLowStock(product.id);
    res.status(201).json(product);
  }),
);

productsRouter.put(
  '/:id',
  requireRole(Role.ADMIN),
  ah(async (req, res) => {
    const me = currentUser(req);
    const { id } = parse(idParam, req.params);
    const body = parse(productBody, req.body);
    const before = await prisma.product.findFirst({ where: { id, companyId: me.companyId } });
    if (!before) throw notFound('Producto no encontrado');
    const product = await prisma.product.update({
      where: { id },
      data: { name: body.name, description: body.description ?? null, unit: body.unit, minStock: body.minStock, active: body.active ?? before.active },
    });
    await audit(req, 'PRODUCT_UPDATED', 'Product', id, {
      before: { name: before.name, unit: before.unit, minStock: before.minStock, active: before.active },
      after: { name: product.name, unit: product.unit, minStock: product.minStock, active: product.active },
    });
    await notifyLowStock(id);
    res.json(product);
  }),
);
