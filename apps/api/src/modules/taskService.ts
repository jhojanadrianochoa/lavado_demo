import { RequirementStatus, Role, type Prisma } from '@prisma/client';
import { badRequest, notFound } from '../lib/errors.js';
import { prisma } from '../lib/prisma.js';

export async function syncRequirement(tx: Prisma.TransactionClient, requirementId: number | null, status: RequirementStatus, assigneeId?: number | null) {
  if (!requirementId) return;
  const data: Prisma.RequirementUpdateInput = { status };
  if (status === RequirementStatus.ASIGNADO) {
    data.assignedAt = new Date();
    data.assignee = assigneeId ? { connect: { id: assigneeId } } : undefined;
  }
  if (status === RequirementStatus.COMPLETADO) data.completedAt = new Date();
  if (status === RequirementStatus.PENDIENTE) {
    data.assignee = { disconnect: true };
    data.assignedAt = null;
  }
  await tx.requirement.update({ where: { id: requirementId }, data });
}

/** Valida que el responsable exista, esté activo y lo asocia al punto si aún no lo está. */
export async function prepareAssignee(tx: Prisma.TransactionClient, companyId: number, assigneeId: number, pointId: number) {
  const assignee = await tx.user.findFirst({ where: { id: assigneeId, companyId } });
  if (!assignee) throw notFound('Responsable no encontrado');
  if (!assignee.active) throw badRequest('El responsable está inactivo');
  if (assignee.role !== Role.ADMIN) {
    await tx.pointUser.upsert({
      where: { pointId_userId: { pointId, userId: assigneeId } },
      create: { pointId, userId: assigneeId },
      update: {},
    });
  }
  return assignee;
}

export async function getPointName(pointId: number) {
  const p = await prisma.washPoint.findUnique({ where: { id: pointId }, select: { name: true } });
  return p?.name ?? '';
}
