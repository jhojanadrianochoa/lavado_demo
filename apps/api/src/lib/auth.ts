import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import type { Role } from '@prisma/client';
import { config } from '../config.js';

export interface AuthUser {
  id: number;
  companyId: number;
  role: Role;
  name: string;
  username: string;
}

export const SESSION_COOKIE = 'lc_session';

export function hashPassword(password: string) {
  return bcrypt.hash(password, 12);
}

export function verifyPassword(password: string, hash: string) {
  return bcrypt.compare(password, hash);
}

export function signSession(userId: number) {
  return jwt.sign({ sub: String(userId) }, config.jwtSecret, { expiresIn: `${config.sessionHours}h` });
}

export function readSession(token: string): number | null {
  try {
    const payload = jwt.verify(token, config.jwtSecret);
    if (typeof payload === 'string' || !payload.sub) return null;
    return Number(payload.sub);
  } catch {
    return null;
  }
}
