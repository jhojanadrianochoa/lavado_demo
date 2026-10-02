import { MovementType, type Prisma } from '@prisma/client';
import { badRequest, notFound } from '../lib/errors.js';

export interface MovementInput {
  productId: number;
  type: MovementType;
  /** ENTRADA/SALIDA/LLENADO: cantidad positiva. AJUSTE: stock contado (nuevo valor). */
  quantity: number;
  userId: number;
  reason?: string | null;
  pointId?: number | null;
  fillingId?: number | null;
}

const round = (n: number) => Math.round(n * 1000) / 1000;

/** Aplica un movimiento de inventario dentro de una transacción y actualiza el stock del producto. */
export async function applyMovement(tx: Prisma.TransactionClient, input: MovementInput) {
  const product = await tx.product.findUnique({ where: { id: input.productId } });
  if (!product) throw notFound('Producto no encontrado');
  if (input.quantity < 0) throw badRequest('La cantidad no puede ser negativa');
  let delta: number;
  switch (input.type) {
    case MovementType.ENTRADA:
      delta = input.quantity;
      break;
    case MovementType.SALIDA:
    case MovementType.LLENADO:
      delta = -input.quantity;
      break;
    case MovementType.AJUSTE:
      delta = input.quantity - product.currentStock;
      break;
  }
  delta = round(delta);
  const updated = await tx.product.update({
    where: { id: product.id },
    data: { currentStock: { increment: delta } },
  });
  const balanceAfter = round(updated.currentStock);
  if (balanceAfter !== updated.currentStock) {
    await tx.product.update({ where: { id: product.id }, data: { currentStock: balanceAfter } });
  }
  return tx.inventoryMovement.create({
    data: {
      productId: product.id,
      type: input.type,
      quantity: delta,
      balanceAfter,
      userId: input.userId,
      reason: input.reason ?? null,
      pointId: input.pointId ?? null,
      fillingId: input.fillingId ?? null,
    },
  });
}
