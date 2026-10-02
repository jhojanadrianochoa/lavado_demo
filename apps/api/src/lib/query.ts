import { z } from 'zod';
import { badRequest } from './errors.js';

export function parse<T extends z.ZodTypeAny>(schema: T, data: unknown): z.infer<T> {
  const result = schema.safeParse(data);
  if (!result.success) {
    const fields = result.error.flatten().fieldErrors;
    throw badRequest('Datos inválidos', fields);
  }
  return result.data;
}

const optionalId = z.preprocess((v) => (v === '' || v === undefined ? undefined : v), z.coerce.number().int().positive().optional());
const optionalString = z.preprocess((v) => (v === '' ? undefined : v), z.string().optional());
const optionalDate = z.preprocess(
  (v) => (v === '' ? undefined : v),
  z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}/, 'Fecha inválida')
    .optional(),
);

export const listQuery = z.object({
  q: optionalString,
  from: optionalDate,
  to: optionalDate,
  pointId: optionalId,
  productId: optionalId,
  userId: optionalId,
  status: optionalString,
  type: optionalString,
  priority: optionalString,
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(500).default(25),
});
export type ListQuery = z.infer<typeof listQuery>;

/** Rango de fechas inclusivo (fecha final hasta las 23:59:59.999). */
export function dateRange(from?: string, to?: string) {
  if (!from && !to) return undefined;
  const range: { gte?: Date; lte?: Date } = {};
  if (from) range.gte = new Date(`${from.slice(0, 10)}T00:00:00`);
  if (to) range.lte = new Date(`${to.slice(0, 10)}T23:59:59.999`);
  return range;
}

export function paginate(q: { page: number; pageSize: number }) {
  return { skip: (q.page - 1) * q.pageSize, take: q.pageSize };
}

export const idParam = z.object({ id: z.coerce.number().int().positive() });

export const optionalText = z.preprocess(
  (v) => (typeof v === 'string' && v.trim() === '' ? null : v),
  z.string().trim().max(2000).nullable().optional(),
);
export const optionalFk = z.preprocess(
  (v) => (v === '' || v === 0 ? null : v),
  z.coerce.number().int().positive().nullable().optional(),
);
export const optionalDateTime = z.preprocess(
  (v) => (v === '' ? null : v),
  z.coerce.date().nullable().optional(),
);
