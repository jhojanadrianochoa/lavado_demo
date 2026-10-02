import { Router } from 'express';
import { Prisma, Role } from '@prisma/client';
import { z } from 'zod';
import { audit } from '../lib/audit.js';
import { ah, notFound } from '../lib/errors.js';
import { prisma } from '../lib/prisma.js';
import { dateRange, idParam, listQuery, optionalFk, optionalText, paginate, parse } from '../lib/query.js';
import { accessiblePointIds, assertPointAccess } from '../lib/scope.js';
import { currentUser, requireRole } from '../middleware/auth.js';

export const pointsRouter = Router();

const pointBody = z.object({
  code: z.string().trim().toUpperCase().min(1).max(30),
  name: z.string().trim().min(2).max(120),
  address: z.string().trim().min(2).max(250),
  city: z.string().trim().min(2).max(120),
  active: z.boolean().optional(),
  managerId: optionalFk,
  notes: optionalText,
  latitude: z.number().min(-90).max(90).nullable().optional(),
  longitude: z.number().min(-180).max(180).nullable().optional(),
  userIds: z.array(z.number().int().positive()).optional(),
  productIds: z.array(z.number().int().positive()).optional(),
});

const userMini = { select: { id: true, name: true, username: true, role: true, active: true } } as const;

pointsRouter.get(
  '/',
  ah(async (req, res) => {
    const me = currentUser(req);
    const q = parse(listQuery.extend({ active: z.enum(['true', 'false']).optional() }), req.query);
    const ids = await accessiblePointIds(me);
    const where: Prisma.WashPointWhereInput = { companyId: me.companyId };
    if (ids) where.id = { in: ids };
    if (q.active) where.active = q.active === 'true';
    if (q.q) {
      where.OR = [
        { name: { contains: q.q, mode: 'insensitive' } },
        { code: { contains: q.q, mode: 'insensitive' } },
        { city: { contains: q.q, mode: 'insensitive' } },
      ];
    }
    const [items, total] = await Promise.all([
      prisma.washPoint.findMany({
        where,
        include: {
          manager: userMini,
          _count: { select: { users: true, tasks: { where: { status: { in: ['PENDIENTE', 'ASIGNADA', 'EN_PROCESO'] } } }, incidents: { where: { status: { in: ['ABIERTA', 'EN_PROCESO'] } } } } },
          products: { select: { product: { select: { id: true, name: true } } } },
        },
        orderBy: { name: 'asc' },
        ...paginate(q),
      }),
      prisma.washPoint.count({ where }),
    ]);
    res.json({ items, total, page: q.page, pageSize: q.pageSize });
  }),
);

pointsRouter.get(
  '/:id',
  ah(async (req, res) => {
    const me = currentUser(req);
    const { id } = parse(idParam, req.params);
    await assertPointAccess(me, id);
    const point = await prisma.washPoint.findFirst({
      where: { id, companyId: me.companyId },
      include: {
        manager: userMini,
        users: { select: { user: userMini } },
        products: { select: { product: { select: { id: true, name: true, unit: true, currentStock: true, minStock: true } } } },
      },
    });
    if (!point) throw notFound('Punto no encontrado');
    res.json(point);
  }),
);

pointsRouter.get(
  '/:id/stats',
  ah(async (req, res) => {
    const me = currentUser(req);
    const { id } = parse(idParam, req.params);
    await assertPointAccess(me, id);
    const q = parse(listQuery, req.query);
    const range = dateRange(q.from, q.to);
    const [byProduct, tasks, incidents, totalFillings] = await Promise.all([
      prisma.filling.groupBy({ by: ['productId', 'unit'], where: { pointId: id, filledAt: range }, _sum: { quantity: true }, _count: true }),
      prisma.task.groupBy({ by: ['status'], where: { pointId: id, createdAt: range }, _count: true }),
      prisma.incident.groupBy({ by: ['status'], where: { pointId: id, createdAt: range }, _count: true }),
      prisma.filling.count({ where: { pointId: id, filledAt: range } }),
    ]);
    const products = await prisma.product.findMany({ where: { id: { in: byProduct.map((b) => b.productId) } }, select: { id: true, name: true } });
    res.json({
      consumption: byProduct.map((b) => ({
        productId: b.productId,
        product: products.find((p) => p.id === b.productId)?.name ?? '',
        unit: b.unit,
        quantity: b._sum.quantity ?? 0,
        fillings: b._count,
      })),
      tasksByStatus: tasks.map((t) => ({ status: t.status, count: t._count })),
      incidentsByStatus: incidents.map((t) => ({ status: t.status, count: t._count })),
      totalFillings,
    });
  }),
);

pointsRouter.post(
  '/',
  requireRole(Role.ADMIN),
  ah(async (req, res) => {
    const me = currentUser(req);
    const body = parse(pointBody, req.body);
    const point = await prisma.washPoint.create({
      data: {
        companyId: me.companyId,
        code: body.code,
        name: body.name,
        address: body.address,
        city: body.city,
        active: body.active ?? true,
        managerId: body.managerId ?? null,
        notes: body.notes ?? null,
        latitude: body.latitude ?? null,
        longitude: body.longitude ?? null,
        users: body.userIds ? { create: body.userIds.map((userId) => ({ userId })) } : undefined,
        products: body.productIds ? { create: body.productIds.map((productId) => ({ productId })) } : undefined,
      },
    });
    await audit(req, 'POINT_CREATED', 'WashPoint', point.id, { code: point.code, name: point.name });
    res.status(201).json(point);
  }),
);

pointsRouter.put(
  '/:id',
  requireRole(Role.ADMIN),
  ah(async (req, res) => {
    const me = currentUser(req);
    const { id } = parse(idParam, req.params);
    const body = parse(pointBody, req.body);
    const before = await prisma.washPoint.findFirst({ where: { id, companyId: me.companyId } });
    if (!before) throw notFound('Punto no encontrado');
    const point = await prisma.$transaction(async (tx) => {
      if (body.userIds) {
        await tx.pointUser.deleteMany({ where: { pointId: id } });
        await tx.pointUser.createMany({ data: body.userIds.map((userId) => ({ userId, pointId: id })) });
      }
      if (body.productIds) {
        await tx.pointProduct.deleteMany({ where: { pointId: id } });
        await tx.pointProduct.createMany({ data: body.productIds.map((productId) => ({ productId, pointId: id })) });
      }
      return tx.washPoint.update({
        where: { id },
        data: {
          code: body.code,
          name: body.name,
          address: body.address,
          city: body.city,
          active: body.active ?? before.active,
          managerId: body.managerId ?? null,
          notes: body.notes ?? null,
          latitude: body.latitude ?? null,
          longitude: body.longitude ?? null,
        },
      });
    });
    await audit(req, 'POINT_UPDATED', 'WashPoint', id, { before: { code: before.code, name: before.name, active: before.active, managerId: before.managerId }, after: body });
    res.json(point);
  }),
);

pointsRouter.patch(
  '/:id/status',
  requireRole(Role.ADMIN),
  ah(async (req, res) => {
    const me = currentUser(req);
    const { id } = parse(idParam, req.params);
    const { active } = parse(z.object({ active: z.boolean() }), req.body);
    const found = await prisma.washPoint.findFirst({ where: { id, companyId: me.companyId } });
    if (!found) throw notFound('Punto no encontrado');
    const point = await prisma.washPoint.update({ where: { id }, data: { active } });
    await audit(req, active ? 'POINT_ACTIVATED' : 'POINT_DEACTIVATED', 'WashPoint', id);
    res.json(point);
  }),
);
