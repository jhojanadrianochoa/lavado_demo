import { Role } from '@prisma/client';
import { prisma } from './prisma.js';

export interface NotificationInput {
  type: string;
  title: string;
  message: string;
  link?: string;
}

export async function notifyUsers(userIds: number[], n: NotificationInput) {
  const unique = [...new Set(userIds)];
  if (!unique.length) return;
  await prisma.notification.createMany({ data: unique.map((userId) => ({ userId, ...n })) });
}

export async function adminIds(companyId: number) {
  const admins = await prisma.user.findMany({
    where: { companyId, role: Role.ADMIN, active: true },
    select: { id: true },
  });
  return admins.map((a) => a.id);
}

/** Administradores + supervisores y encargado asociados al punto. */
export async function pointManagerIds(pointId: number) {
  const point = await prisma.washPoint.findUnique({
    where: { id: pointId },
    select: {
      companyId: true,
      managerId: true,
      users: { where: { user: { role: Role.SUPERVISOR, active: true } }, select: { userId: true } },
    },
  });
  if (!point) return [];
  const ids = await adminIds(point.companyId);
  if (point.managerId) ids.push(point.managerId);
  ids.push(...point.users.map((u) => u.userId));
  return ids;
}

export async function notifyLowStock(productId: number) {
  const product = await prisma.product.findUnique({ where: { id: productId } });
  if (!product || product.currentStock > product.minStock) return;
  await notifyUsers(await adminIds(product.companyId), {
    type: 'STOCK_BAJO',
    title: 'Producto con stock bajo',
    message: `${product.name}: ${product.currentStock} ${product.unit} (mínimo ${product.minStock} ${product.unit})`,
    link: '/inventario',
  });
}
