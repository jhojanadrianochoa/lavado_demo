import { Role } from '@prisma/client';
import type { AuthUser } from './auth.js';
import { forbidden } from './errors.js';
import { prisma } from './prisma.js';

/** IDs de puntos accesibles por el usuario; null = todos (administrador). */
export async function accessiblePointIds(user: AuthUser): Promise<number[] | null> {
  if (user.role === Role.ADMIN) return null;
  const [links, managed] = await Promise.all([
    prisma.pointUser.findMany({ where: { userId: user.id }, select: { pointId: true } }),
    prisma.washPoint.findMany({ where: { managerId: user.id }, select: { id: true } }),
  ]);
  return [...new Set([...links.map((l) => l.pointId), ...managed.map((m) => m.id)])];
}

/** Filtro Prisma por pointId según alcance del usuario, combinado con un punto solicitado. */
export async function pointFilter(user: AuthUser, requested?: number) {
  const ids = await accessiblePointIds(user);
  if (requested) {
    if (ids && !ids.includes(requested)) throw forbidden('No tiene acceso a este punto');
    return { pointId: requested };
  }
  return ids ? { pointId: { in: ids } } : {};
}

export async function assertPointAccess(user: AuthUser, pointId: number) {
  const ids = await accessiblePointIds(user);
  if (ids && !ids.includes(pointId)) throw forbidden('No tiene acceso a este punto');
}

export const isManager = (user: AuthUser) => user.role === Role.ADMIN || user.role === Role.SUPERVISOR;
