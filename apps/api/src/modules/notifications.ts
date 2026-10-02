import { Router } from 'express';
import { z } from 'zod';
import { ah } from '../lib/errors.js';
import { prisma } from '../lib/prisma.js';
import { idParam, parse } from '../lib/query.js';
import { currentUser } from '../middleware/auth.js';

export const notificationsRouter = Router();

notificationsRouter.get(
  '/',
  ah(async (req, res) => {
    const me = currentUser(req);
    const q = parse(z.object({ unread: z.enum(['true']).optional(), limit: z.coerce.number().int().min(1).max(200).default(30) }), req.query);
    const [items, unreadCount] = await Promise.all([
      prisma.notification.findMany({
        where: { userId: me.id, ...(q.unread ? { readAt: null } : {}) },
        orderBy: { createdAt: 'desc' },
        take: q.limit,
      }),
      prisma.notification.count({ where: { userId: me.id, readAt: null } }),
    ]);
    res.json({ items, unreadCount });
  }),
);

notificationsRouter.post(
  '/read-all',
  ah(async (req, res) => {
    await prisma.notification.updateMany({ where: { userId: currentUser(req).id, readAt: null }, data: { readAt: new Date() } });
    res.json({ ok: true });
  }),
);

notificationsRouter.post(
  '/:id/read',
  ah(async (req, res) => {
    const { id } = parse(idParam, req.params);
    await prisma.notification.updateMany({ where: { id, userId: currentUser(req).id }, data: { readAt: new Date() } });
    res.json({ ok: true });
  }),
);
