import { Router } from 'express';
import { Prisma, Role } from '@prisma/client';
import { z } from 'zod';
import { hashPassword } from '../lib/auth.js';
import { audit } from '../lib/audit.js';
import { ah, badRequest, notFound } from '../lib/errors.js';
import { prisma } from '../lib/prisma.js';
import { idParam, listQuery, optionalText, paginate, parse } from '../lib/query.js';
import { accessiblePointIds } from '../lib/scope.js';
import { currentUser, requireRole } from '../middleware/auth.js';
import { passwordSchema } from './auth.js';

export const usersRouter = Router();

const userSelect = {
  id: true,
  name: true,
  username: true,
  email: true,
  phone: true,
  role: true,
  active: true,
  lastLoginAt: true,
  createdAt: true,
  points: { select: { point: { select: { id: true, name: true, code: true } } } },
} satisfies Prisma.UserSelect;

const userBody = z.object({
  name: z.string().trim().min(2).max(120),
  username: z
    .string()
    .trim()
    .toLowerCase()
    .min(3)
    .max(40)
    .regex(/^[a-z0-9._-]+$/, 'Solo letras, números, punto, guion y guion bajo'),
  email: z.preprocess((v) => (v === '' ? null : v), z.string().email().nullable().optional()),
  phone: optionalText,
  role: z.nativeEnum(Role),
  active: z.boolean().optional(),
  pointIds: z.array(z.number().int().positive()).optional(),
});

usersRouter.get(
  '/',
  requireRole(Role.ADMIN, Role.SUPERVISOR),
  ah(async (req, res) => {
    const me = currentUser(req);
    const q = parse(listQuery.extend({ role: z.nativeEnum(Role).optional(), active: z.enum(['true', 'false']).optional() }), req.query);
    const where: Prisma.UserWhereInput = { companyId: me.companyId };
    if (q.role) where.role = q.role;
    if (q.active) where.active = q.active === 'true';
    if (q.pointId) where.points = { some: { pointId: q.pointId } };
    if (q.q) where.OR = [{ name: { contains: q.q, mode: 'insensitive' } }, { username: { contains: q.q, mode: 'insensitive' } }];
    if (me.role === Role.SUPERVISOR) {
      const ids = (await accessiblePointIds(me)) ?? [];
      where.AND = [{ OR: [{ id: me.id }, { points: { some: { pointId: { in: ids } } } }] }];
    }
    const [items, total] = await Promise.all([
      prisma.user.findMany({ where, select: userSelect, orderBy: { name: 'asc' }, ...paginate(q) }),
      prisma.user.count({ where }),
    ]);
    res.json({ items, total, page: q.page, pageSize: q.pageSize });
  }),
);

usersRouter.get(
  '/:id',
  requireRole(Role.ADMIN, Role.SUPERVISOR),
  ah(async (req, res) => {
    const { id } = parse(idParam, req.params);
    const user = await prisma.user.findFirst({ where: { id, companyId: currentUser(req).companyId }, select: userSelect });
    if (!user) throw notFound('Usuario no encontrado');
    res.json(user);
  }),
);

usersRouter.post(
  '/',
  requireRole(Role.ADMIN),
  ah(async (req, res) => {
    const me = currentUser(req);
    const body = parse(userBody.extend({ password: passwordSchema }), req.body);
    const user = await prisma.user.create({
      data: {
        companyId: me.companyId,
        name: body.name,
        username: body.username,
        email: body.email ?? null,
        phone: body.phone ?? null,
        role: body.role,
        active: body.active ?? true,
        passwordHash: await hashPassword(body.password),
        points: body.pointIds ? { create: body.pointIds.map((pointId) => ({ pointId })) } : undefined,
      },
      select: userSelect,
    });
    await audit(req, 'USER_CREATED', 'User', user.id, { username: user.username, role: user.role });
    res.status(201).json(user);
  }),
);

usersRouter.put(
  '/:id',
  requireRole(Role.ADMIN),
  ah(async (req, res) => {
    const me = currentUser(req);
    const { id } = parse(idParam, req.params);
    const body = parse(userBody, req.body);
    const before = await prisma.user.findFirst({ where: { id, companyId: me.companyId } });
    if (!before) throw notFound('Usuario no encontrado');
    if (id === me.id && (body.role !== Role.ADMIN || body.active === false)) {
      throw badRequest('No puede quitarse a sí mismo el rol de administrador ni desactivarse');
    }
    const user = await prisma.$transaction(async (tx) => {
      if (body.pointIds) {
        await tx.pointUser.deleteMany({ where: { userId: id } });
        await tx.pointUser.createMany({ data: body.pointIds.map((pointId) => ({ pointId, userId: id })) });
      }
      return tx.user.update({
        where: { id },
        data: {
          name: body.name,
          username: body.username,
          email: body.email ?? null,
          phone: body.phone ?? null,
          role: body.role,
          active: body.active ?? before.active,
        },
        select: userSelect,
      });
    });
    await audit(req, 'USER_UPDATED', 'User', id, {
      before: { name: before.name, username: before.username, role: before.role, active: before.active },
      after: { name: user.name, username: user.username, role: user.role, active: user.active },
      pointIds: body.pointIds,
    });
    res.json(user);
  }),
);

usersRouter.patch(
  '/:id/status',
  requireRole(Role.ADMIN),
  ah(async (req, res) => {
    const me = currentUser(req);
    const { id } = parse(idParam, req.params);
    const { active } = parse(z.object({ active: z.boolean() }), req.body);
    if (id === me.id && !active) throw badRequest('No puede desactivar su propio usuario');
    const found = await prisma.user.findFirst({ where: { id, companyId: me.companyId } });
    if (!found) throw notFound('Usuario no encontrado');
    const user = await prisma.user.update({ where: { id }, data: { active }, select: userSelect });
    await audit(req, active ? 'USER_ACTIVATED' : 'USER_DEACTIVATED', 'User', id);
    res.json(user);
  }),
);

usersRouter.post(
  '/:id/password',
  requireRole(Role.ADMIN),
  ah(async (req, res) => {
    const me = currentUser(req);
    const { id } = parse(idParam, req.params);
    const { password } = parse(z.object({ password: passwordSchema }), req.body);
    const found = await prisma.user.findFirst({ where: { id, companyId: me.companyId } });
    if (!found) throw notFound('Usuario no encontrado');
    await prisma.user.update({ where: { id }, data: { passwordHash: await hashPassword(password) } });
    await audit(req, 'PASSWORD_RESET', 'User', id);
    res.json({ ok: true });
  }),
);
