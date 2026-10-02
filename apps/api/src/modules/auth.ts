import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { config } from '../config.js';
import { hashPassword, SESSION_COOKIE, signSession, verifyPassword } from '../lib/auth.js';
import { audit } from '../lib/audit.js';
import { ah, badRequest, unauthorized } from '../lib/errors.js';
import { prisma } from '../lib/prisma.js';
import { parse } from '../lib/query.js';
import { currentUser, requireAuth } from '../middleware/auth.js';

export const authRouter = Router();

const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 20, standardHeaders: true, legacyHeaders: false, message: { message: 'Demasiados intentos. Intente más tarde.' } });

export const passwordSchema = z.string().min(8, 'Mínimo 8 caracteres').max(100);

async function profile(userId: number) {
  return prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: {
      id: true,
      name: true,
      username: true,
      email: true,
      phone: true,
      role: true,
      companyId: true,
      company: { select: { name: true } },
      points: { select: { point: { select: { id: true, name: true, code: true } } } },
    },
  });
}

authRouter.post(
  '/login',
  loginLimiter,
  ah(async (req, res) => {
    const { username, password } = parse(z.object({ username: z.string().trim().min(1), password: z.string().min(1) }), req.body);
    const user = await prisma.user.findUnique({ where: { username: username.toLowerCase() } });
    if (!user || !(await verifyPassword(password, user.passwordHash))) throw unauthorized('Usuario o contraseña incorrectos');
    if (!user.active) throw unauthorized('Usuario inactivo. Contacte al administrador.');
    await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
    res.cookie(SESSION_COOKIE, signSession(user.id), {
      httpOnly: true,
      sameSite: 'lax',
      secure: config.cookieSecure,
      maxAge: config.sessionHours * 3600 * 1000,
      path: '/',
    });
    req.user = { id: user.id, companyId: user.companyId, role: user.role, name: user.name, username: user.username };
    await audit(req, 'LOGIN', 'User', user.id);
    res.json(await profile(user.id));
  }),
);

authRouter.post('/logout', (_req, res) => {
  res.clearCookie(SESSION_COOKIE, { path: '/' });
  res.json({ ok: true });
});

authRouter.get(
  '/me',
  requireAuth,
  ah(async (req, res) => {
    res.json(await profile(currentUser(req).id));
  }),
);

authRouter.post(
  '/change-password',
  requireAuth,
  ah(async (req, res) => {
    const me = currentUser(req);
    const body = parse(z.object({ currentPassword: z.string().min(1), newPassword: passwordSchema }), req.body);
    const user = await prisma.user.findUniqueOrThrow({ where: { id: me.id } });
    if (!(await verifyPassword(body.currentPassword, user.passwordHash))) throw badRequest('La contraseña actual no es correcta');
    await prisma.user.update({ where: { id: me.id }, data: { passwordHash: await hashPassword(body.newPassword) } });
    await audit(req, 'PASSWORD_CHANGED', 'User', me.id, { self: true });
    res.json({ ok: true });
  }),
);
