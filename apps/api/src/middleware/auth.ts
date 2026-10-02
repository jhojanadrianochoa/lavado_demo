import type { NextFunction, Request, Response } from 'express';
import type { Role } from '@prisma/client';
import { readSession, SESSION_COOKIE, type AuthUser } from '../lib/auth.js';
import { forbidden, unauthorized } from '../lib/errors.js';
import { prisma } from '../lib/prisma.js';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

export async function requireAuth(req: Request, _res: Response, next: NextFunction) {
  try {
    const token: string | undefined = req.cookies?.[SESSION_COOKIE];
    const userId = token ? readSession(token) : null;
    if (!userId) throw unauthorized();
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, companyId: true, role: true, name: true, username: true, active: true },
    });
    if (!user || !user.active) throw unauthorized('Sesión inválida o usuario inactivo');
    req.user = { id: user.id, companyId: user.companyId, role: user.role, name: user.name, username: user.username };
    next();
  } catch (err) {
    next(err);
  }
}

export function requireRole(...roles: Role[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) return next(unauthorized());
    if (!roles.includes(req.user.role)) return next(forbidden());
    next();
  };
}

export function currentUser(req: Request): AuthUser {
  if (!req.user) throw unauthorized();
  return req.user;
}
