import type { Prisma } from '@prisma/client';
import type { Request } from 'express';
import { prisma } from './prisma.js';

export async function audit(
  req: Request,
  action: string,
  entity: string,
  entityId?: number | null,
  details?: Prisma.InputJsonValue,
) {
  await prisma.auditLog.create({
    data: {
      userId: req.user?.id ?? null,
      action,
      entity,
      entityId: entityId ?? null,
      details,
      ip: req.ip,
    },
  });
}
