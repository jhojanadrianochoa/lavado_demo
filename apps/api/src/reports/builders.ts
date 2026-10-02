import { IncidentStatus, MovementType, Prisma, TaskStatus } from '@prisma/client';
import type { AuthUser } from '../lib/auth.js';
import { badRequest, notFound } from '../lib/errors.js';
import { fmtDate, fmtDateTime, label, round2 } from '../lib/labels.js';
import { prisma } from '../lib/prisma.js';
import { dateRange } from '../lib/query.js';
import { getSettings } from '../lib/settings.js';
import { accessiblePointIds, pointFilter } from '../lib/scope.js';
import { REPORT_TYPES, type Cell, type Report, type ReportSection, type ReportType } from './types.js';

export interface ReportFilters {
  from: string;
  to: string;
  pointId?: number;
  productId?: number;
  userId?: number;
  status?: string;
}

interface Ctx {
  user: AuthUser;
  f: ReportFilters;
  range: { gte?: Date; lte?: Date };
  scope: { pointId?: number | { in: number[] } };
}

const qty = (n: number, unit: string) => `${round2(n).toLocaleString('es-CO')} ${unit}`;
const sumBy = <T>(items: T[], fn: (i: T) => number) => items.reduce((a, i) => a + fn(i), 0);

function unitTotals(rows: { quantity: number; unit: string }[]) {
  const map = new Map<string, number>();
  for (const r of rows) map.set(r.unit, (map.get(r.unit) ?? 0) + r.quantity);
  return [...map.entries()].map(([u, q]) => qty(q, u)).join(' · ') || '0';
}

function fillingWhere(c: Ctx): Prisma.FillingWhereInput {
  return { ...c.scope, filledAt: c.range, ...(c.f.productId ? { productId: c.f.productId } : {}), ...(c.f.userId ? { userId: c.f.userId } : {}) };
}

async function fillings(c: Ctx) {
  return prisma.filling.findMany({
    where: fillingWhere(c),
    include: { point: { select: { id: true, name: true, code: true } }, product: { select: { id: true, name: true } }, user: { select: { id: true, name: true } } },
    orderBy: { filledAt: 'asc' },
  });
}

type FillingRow = Awaited<ReturnType<typeof fillings>>[number];

function groupFillings(rows: FillingRow[], keyFn: (r: FillingRow) => string, base: (r: FillingRow) => Record<string, Cell>) {
  const map = new Map<string, { row: Record<string, Cell>; quantity: number; count: number; unit: string }>();
  for (const r of rows) {
    const k = `${keyFn(r)}|${r.unit}`;
    const e = map.get(k) ?? { row: base(r), quantity: 0, count: 0, unit: r.unit };
    e.quantity += r.quantity;
    e.count += 1;
    map.set(k, e);
  }
  return [...map.values()].map((e): Record<string, Cell> => ({ ...e.row, quantity: round2(e.quantity), unit: e.unit, count: e.count }));
}

async function consumptionSections(c: Ctx): Promise<{ sections: ReportSection[]; total: string; rows: FillingRow[] }> {
  const rows = await fillings(c);
  const period = `${fmtDate(c.range.gte)} - ${fmtDate(c.range.lte)}`;
  const byProduct = groupFillings(rows, (r) => String(r.productId), (r) => ({ product: r.product.name }));
  const detail = groupFillings(
    rows,
    (r) => `${r.productId}-${r.pointId}-${r.userId}`,
    (r) => ({ product: r.product.name, point: r.point.name, user: r.user.name, period }),
  ).sort((a, b) => String(a.product).localeCompare(String(b.product)) || String(a.point).localeCompare(String(b.point)));
  const total = unitTotals(rows);
  return {
    rows,
    total,
    sections: [
      {
        title: 'Consumo total por producto',
        columns: [
          { key: 'product', label: 'Producto' },
          { key: 'count', label: 'Llenados', align: 'right' },
          { key: 'quantity', label: 'Cantidad llenada', align: 'right' },
          { key: 'unit', label: 'Unidad' },
        ],
        rows: byProduct,
        totals: { product: 'Total general', count: rows.length, quantity: total },
        chart: { title: 'Consumo por producto', labelKey: 'product', valueKey: 'quantity' },
      },
      {
        title: 'Detalle por producto, punto y usuario',
        columns: [
          { key: 'product', label: 'Producto' },
          { key: 'point', label: 'Punto' },
          { key: 'user', label: 'Usuario' },
          { key: 'period', label: 'Período' },
          { key: 'quantity', label: 'Cantidad total llenada', align: 'right' },
          { key: 'unit', label: 'Unidad' },
        ],
        rows: detail,
        totals: { product: 'Total general', quantity: total },
      },
    ],
  };
}

async function consumoProductos(c: Ctx) {
  const { sections, total, rows } = await consumptionSections(c);
  return { kpis: [{ label: 'Total llenado', value: total }, { label: 'Registros de llenado', value: String(rows.length) }], sections };
}

async function consumoPunto(c: Ctx) {
  const rows = await fillings(c);
  const byPoint = groupFillings(rows, (r) => `${r.pointId}`, (r) => ({ point: r.point.name, code: r.point.code }));
  const detail = groupFillings(rows, (r) => `${r.pointId}-${r.productId}`, (r) => ({ point: r.point.name, product: r.product.name })).sort(
    (a, b) => String(a.point).localeCompare(String(b.point)) || String(a.product).localeCompare(String(b.product)),
  );
  const total = unitTotals(rows);
  const pointSections: ReportSection[] = [...new Set(detail.map((d) => String(d.point)))].map((pointName) => {
    const items = detail.filter((d) => d.point === pointName);
    return {
      title: pointName,
      columns: [
        { key: 'product', label: 'Producto' },
        { key: 'count', label: 'Llenados', align: 'right' },
        { key: 'quantity', label: 'Cantidad llenada', align: 'right' },
        { key: 'unit', label: 'Unidad' },
      ],
      rows: items,
      totals: { product: 'Total', quantity: unitTotals(items.map((i) => ({ quantity: Number(i.quantity), unit: String(i.unit) }))) },
    };
  });
  return {
    kpis: [{ label: 'Total llenado', value: total }, { label: 'Puntos con consumo', value: String(byPoint.length) }],
    sections: [
      {
        title: 'Consumo total por punto',
        columns: [
          { key: 'code', label: 'Código' },
          { key: 'point', label: 'Punto' },
          { key: 'count', label: 'Llenados', align: 'right' },
          { key: 'quantity', label: 'Cantidad llenada', align: 'right' },
          { key: 'unit', label: 'Unidad' },
        ],
        rows: byPoint.sort((a, b) => Number(b.quantity) - Number(a.quantity)),
        totals: { point: 'Total general', count: rows.length, quantity: total },
        chart: { title: 'Consumo por punto', labelKey: 'point', valueKey: 'quantity' },
      } satisfies ReportSection,
      ...pointSections,
    ],
  };
}

async function taskList(c: Ctx) {
  const where: Prisma.TaskWhereInput = {
    ...c.scope,
    createdAt: c.range,
    ...(c.f.userId ? { assigneeId: c.f.userId } : {}),
    ...(c.f.productId ? { productId: c.f.productId } : {}),
    ...(c.f.status && (Object.values(TaskStatus) as string[]).includes(c.f.status) ? { status: c.f.status as TaskStatus } : {}),
  };
  return prisma.task.findMany({
    where,
    include: { point: { select: { name: true } }, assignee: { select: { name: true } }, product: { select: { name: true } } },
    orderBy: { createdAt: 'asc' },
  });
}

function taskStatusSection(tasks: { status: TaskStatus }[]): ReportSection {
  const statuses = Object.values(TaskStatus);
  return {
    title: 'Tareas por estado',
    columns: [
      { key: 'status', label: 'Estado' },
      { key: 'count', label: 'Cantidad', align: 'right' },
    ],
    rows: statuses.map((s) => ({ status: label(s), count: tasks.filter((t) => t.status === s).length })),
    totals: { status: 'Total tareas creadas', count: tasks.length },
    chart: { title: 'Tareas por estado', labelKey: 'status', valueKey: 'count' },
  };
}

async function tareas(c: Ctx) {
  const tasks = await taskList(c);
  const count = (s: TaskStatus) => tasks.filter((t) => t.status === s).length;
  return {
    kpis: [
      { label: 'Tareas creadas', value: String(tasks.length) },
      { label: 'Pendientes', value: String(count(TaskStatus.PENDIENTE) + count(TaskStatus.ASIGNADA)) },
      { label: 'En proceso', value: String(count(TaskStatus.EN_PROCESO)) },
      { label: 'Completadas', value: String(count(TaskStatus.COMPLETADA)) },
      { label: 'Canceladas', value: String(count(TaskStatus.CANCELADA)) },
    ],
    sections: [
      taskStatusSection(tasks),
      {
        title: 'Detalle de tareas',
        columns: [
          { key: 'id', label: '#', align: 'right' },
          { key: 'date', label: 'Fecha' },
          { key: 'point', label: 'Punto' },
          { key: 'type', label: 'Tipo' },
          { key: 'description', label: 'Descripción' },
          { key: 'assignee', label: 'Responsable' },
          { key: 'status', label: 'Estado' },
          { key: 'completed', label: 'Finalizada' },
        ],
        rows: tasks.map((t) => ({
          id: t.id,
          date: fmtDate(t.createdAt),
          point: t.point.name,
          type: label(t.type),
          description: t.description,
          assignee: t.assignee?.name ?? 'Sin asignar',
          status: label(t.status),
          completed: fmtDateTime(t.completedAt),
        })),
      } satisfies ReportSection,
    ],
  };
}

async function trabajador(c: Ctx) {
  const ids = await accessiblePointIds(c.user);
  const users = await prisma.user.findMany({
    where: {
      companyId: c.user.companyId,
      ...(c.f.userId ? { id: c.f.userId } : { role: { in: ['WORKER', 'SUPERVISOR'] } }),
      ...(ids ? { points: { some: { pointId: { in: ids } } } } : {}),
      ...(c.f.pointId ? { points: { some: { pointId: c.f.pointId } } } : {}),
    },
    orderBy: { name: 'asc' },
  });
  const [tasks, fills, incidents] = await Promise.all([
    prisma.task.findMany({ where: { ...c.scope, createdAt: c.range, assigneeId: { in: users.map((u) => u.id) } }, select: { assigneeId: true, status: true } }),
    prisma.filling.findMany({ where: { ...fillingWhere(c), userId: { in: users.map((u) => u.id) } }, select: { userId: true, quantity: true, unit: true } }),
    prisma.incident.findMany({ where: { ...c.scope, createdAt: c.range, reportedById: { in: users.map((u) => u.id) } }, select: { reportedById: true } }),
  ]);
  const rows = users.map((u) => {
    const ut = tasks.filter((t) => t.assigneeId === u.id);
    const uf = fills.filter((f) => f.userId === u.id);
    return {
      user: u.name,
      role: label(u.role),
      assigned: ut.length,
      pending: ut.filter((t) => t.status === TaskStatus.PENDIENTE || t.status === TaskStatus.ASIGNADA).length,
      inProgress: ut.filter((t) => t.status === TaskStatus.EN_PROCESO).length,
      completed: ut.filter((t) => t.status === TaskStatus.COMPLETADA).length,
      fillings: uf.length,
      quantity: unitTotals(uf),
      quantityValue: round2(sumBy(uf, (f) => f.quantity)),
      incidents: incidents.filter((i) => i.reportedById === u.id).length,
    };
  });
  return {
    kpis: [
      { label: 'Trabajadores', value: String(users.length) },
      { label: 'Tareas completadas', value: String(sumBy(rows, (r) => r.completed)) },
      { label: 'Producto registrado', value: unitTotals(fills) },
      { label: 'Incidencias reportadas', value: String(incidents.length) },
    ],
    sections: [
      {
        title: 'Desempeño por trabajador',
        columns: [
          { key: 'user', label: 'Trabajador' },
          { key: 'assigned', label: 'Tareas asignadas', align: 'right' },
          { key: 'pending', label: 'Pendientes', align: 'right' },
          { key: 'inProgress', label: 'En proceso', align: 'right' },
          { key: 'completed', label: 'Completadas', align: 'right' },
          { key: 'fillings', label: 'Llenados', align: 'right' },
          { key: 'quantity', label: 'Producto registrado', align: 'right' },
          { key: 'incidents', label: 'Incidencias', align: 'right' },
        ],
        rows,
        totals: {
          user: 'Total',
          assigned: sumBy(rows, (r) => r.assigned),
          pending: sumBy(rows, (r) => r.pending),
          inProgress: sumBy(rows, (r) => r.inProgress),
          completed: sumBy(rows, (r) => r.completed),
          fillings: fills.length,
          quantity: unitTotals(fills),
          incidents: incidents.length,
        },
        chart: { title: 'Tareas completadas por trabajador', labelKey: 'user', valueKey: 'completed' },
      } satisfies ReportSection,
    ],
  };
}

async function incidentList(c: Ctx) {
  return prisma.incident.findMany({
    where: {
      ...c.scope,
      createdAt: c.range,
      ...(c.f.userId ? { OR: [{ reportedById: c.f.userId }, { assigneeId: c.f.userId }] } : {}),
      ...(c.f.status && (Object.values(IncidentStatus) as string[]).includes(c.f.status) ? { status: c.f.status as IncidentStatus } : {}),
    },
    include: { point: { select: { name: true } }, reportedBy: { select: { name: true } }, assignee: { select: { name: true } } },
    orderBy: { createdAt: 'asc' },
  });
}

const hoursBetween = (a: Date, b: Date | null) => (b ? round2((b.getTime() - a.getTime()) / 3600000) : null);

async function incidencias(c: Ctx) {
  const items = await incidentList(c);
  const types = [...new Set(items.map((i) => i.type))];
  const resolved = items.filter((i) => i.resolvedAt);
  const avg = resolved.length ? round2(sumBy(resolved, (i) => hoursBetween(i.createdAt, i.resolvedAt) ?? 0) / resolved.length) : 0;
  return {
    kpis: [
      { label: 'Total incidencias', value: String(items.length) },
      { label: 'Abiertas', value: String(items.filter((i) => i.status === IncidentStatus.ABIERTA).length) },
      { label: 'En proceso', value: String(items.filter((i) => i.status === IncidentStatus.EN_PROCESO).length) },
      { label: 'Solucionadas/cerradas', value: String(resolved.length) },
      { label: 'Tiempo promedio de resolución', value: `${avg} h` },
    ],
    sections: [
      {
        title: 'Incidencias por tipo',
        columns: [
          { key: 'type', label: 'Tipo' },
          { key: 'count', label: 'Cantidad', align: 'right' },
        ],
        rows: types.map((t) => ({ type: label(t), count: items.filter((i) => i.type === t).length })),
        totals: { type: 'Total', count: items.length },
        chart: { title: 'Incidencias por tipo', labelKey: 'type', valueKey: 'count' },
      },
      {
        title: 'Incidencias por estado',
        columns: [
          { key: 'status', label: 'Estado' },
          { key: 'count', label: 'Cantidad', align: 'right' },
        ],
        rows: Object.values(IncidentStatus).map((s) => ({ status: label(s), count: items.filter((i) => i.status === s).length })),
      },
      {
        title: 'Detalle de incidencias',
        columns: [
          { key: 'id', label: '#', align: 'right' },
          { key: 'date', label: 'Fecha' },
          { key: 'point', label: 'Punto' },
          { key: 'type', label: 'Tipo' },
          { key: 'reporter', label: 'Reportó' },
          { key: 'assignee', label: 'Responsable' },
          { key: 'status', label: 'Estado' },
          { key: 'hours', label: 'Resolución (h)', align: 'right' },
        ],
        rows: items.map((i) => ({
          id: i.id,
          date: fmtDateTime(i.createdAt),
          point: i.point.name,
          type: label(i.type),
          reporter: i.reportedBy.name,
          assignee: i.assignee?.name ?? '',
          status: label(i.status),
          hours: hoursBetween(i.createdAt, i.resolvedAt),
        })),
      },
    ] satisfies ReportSection[],
  };
}

async function inventorySection(c: Ctx): Promise<ReportSection> {
  const products = await prisma.product.findMany({ where: { companyId: c.user.companyId, ...(c.f.productId ? { id: c.f.productId } : {}) }, orderBy: { name: 'asc' } });
  const movements = await prisma.inventoryMovement.findMany({
    where: { productId: { in: products.map((p) => p.id) }, createdAt: { gte: c.range.gte } },
    select: { productId: true, type: true, quantity: true, createdAt: true },
  });
  const rows = products.map((p) => {
    const after = movements.filter((m) => m.productId === p.id);
    const inRange = after.filter((m) => !c.range.lte || m.createdAt <= c.range.lte);
    const initial = p.currentStock - sumBy(after, (m) => m.quantity);
    const sum = (t: MovementType) => round2(sumBy(inRange.filter((m) => m.type === t), (m) => m.quantity));
    const final = initial + sumBy(inRange, (m) => m.quantity);
    return {
      product: p.name,
      unit: p.unit,
      initial: round2(initial),
      entries: sum(MovementType.ENTRADA),
      fillings: Math.abs(sum(MovementType.LLENADO)),
      outputs: Math.abs(sum(MovementType.SALIDA)),
      adjustments: sum(MovementType.AJUSTE),
      final: round2(final),
      current: round2(p.currentStock),
      min: p.minStock,
      alert: p.currentStock <= p.minStock ? 'Stock bajo' : '',
    };
  });
  return {
    title: 'Inventario por producto',
    columns: [
      { key: 'product', label: 'Producto' },
      { key: 'unit', label: 'Unidad' },
      { key: 'initial', label: 'Stock inicial', align: 'right' },
      { key: 'entries', label: 'Entradas', align: 'right' },
      { key: 'fillings', label: 'Salidas por llenado', align: 'right' },
      { key: 'outputs', label: 'Otras salidas', align: 'right' },
      { key: 'adjustments', label: 'Ajustes', align: 'right' },
      { key: 'final', label: 'Stock al cierre', align: 'right' },
      { key: 'current', label: 'Stock actual', align: 'right' },
      { key: 'min', label: 'Stock mínimo', align: 'right' },
      { key: 'alert', label: 'Alerta' },
    ],
    rows,
    chart: { title: 'Stock actual por producto', labelKey: 'product', valueKey: 'current' },
  };
}

async function inventario(c: Ctx) {
  const section = await inventorySection(c);
  const movements = await prisma.inventoryMovement.findMany({
    where: { createdAt: c.range, product: { companyId: c.user.companyId }, ...(c.f.productId ? { productId: c.f.productId } : {}), ...(c.f.pointId ? { pointId: c.f.pointId } : {}), ...(c.f.userId ? { userId: c.f.userId } : {}) },
    include: { product: { select: { name: true, unit: true } }, user: { select: { name: true } }, point: { select: { name: true } } },
    orderBy: { createdAt: 'asc' },
  });
  return {
    kpis: [
      { label: 'Productos', value: String(section.rows.length) },
      { label: 'Con stock bajo', value: String(section.rows.filter((r) => r.alert).length) },
      { label: 'Movimientos en el período', value: String(movements.length) },
    ],
    sections: [
      section,
      {
        title: 'Movimientos de inventario',
        columns: [
          { key: 'date', label: 'Fecha' },
          { key: 'product', label: 'Producto' },
          { key: 'type', label: 'Tipo' },
          { key: 'quantity', label: 'Cantidad', align: 'right' },
          { key: 'balance', label: 'Saldo', align: 'right' },
          { key: 'user', label: 'Usuario' },
          { key: 'point', label: 'Punto' },
          { key: 'reason', label: 'Motivo' },
        ],
        rows: movements.map((m) => ({
          date: fmtDateTime(m.createdAt),
          product: m.product.name,
          type: label(m.type),
          quantity: round2(m.quantity),
          balance: round2(m.balanceAfter),
          user: m.user.name,
          point: m.point?.name ?? '',
          reason: m.reason ?? '',
        })),
      } satisfies ReportSection,
    ],
  };
}

async function punto(c: Ctx) {
  if (!c.f.pointId) throw badRequest('Seleccione el punto para el informe individual');
  const point = await prisma.washPoint.findUnique({
    where: { id: c.f.pointId },
    include: { manager: { select: { name: true } }, users: { select: { user: { select: { name: true, role: true } } } }, products: { select: { product: { select: { name: true } } } } },
  });
  if (!point) throw notFound('Punto no encontrado');
  const [consumption, tasksR, incidentsR, photos] = await Promise.all([
    consumptionSections(c),
    tareas(c),
    incidencias(c),
    prisma.photo.findMany({
      where: { pointId: point.id, takenAt: c.range },
      include: { user: { select: { name: true } }, task: { select: { id: true } } },
      orderBy: { takenAt: 'desc' },
      take: 200,
    }),
  ]);
  const info: ReportSection = {
    title: 'Información general',
    columns: [
      { key: 'field', label: 'Campo' },
      { key: 'value', label: 'Valor' },
    ],
    rows: [
      { field: 'Código', value: point.code },
      { field: 'Nombre', value: point.name },
      { field: 'Dirección', value: point.address },
      { field: 'Ciudad', value: point.city },
      { field: 'Estado', value: point.active ? 'Activo' : 'Inactivo' },
      { field: 'Encargado', value: point.manager?.name ?? '' },
      { field: 'Usuarios asociados', value: point.users.map((u) => `${u.user.name} (${label(u.user.role)})`).join(', ') },
      { field: 'Productos utilizados', value: point.products.map((p) => p.product.name).join(', ') },
      { field: 'Fecha de creación', value: fmtDate(point.createdAt) },
      { field: 'Observaciones', value: point.notes ?? '' },
    ],
  };
  const fillingDetail: ReportSection = {
    title: 'Historial de llenados',
    columns: [
      { key: 'date', label: 'Fecha y hora' },
      { key: 'product', label: 'Producto' },
      { key: 'quantity', label: 'Cantidad llenada', align: 'right' },
      { key: 'unit', label: 'Unidad' },
      { key: 'user', label: 'Responsable' },
      { key: 'task', label: 'Tarea' },
      { key: 'notes', label: 'Observación' },
    ],
    rows: consumption.rows.map((f) => ({ date: fmtDateTime(f.filledAt), product: f.product.name, quantity: round2(f.quantity), unit: f.unit, user: f.user.name, task: f.taskId ? `#${f.taskId}` : '', notes: f.notes ?? '' })),
    totals: { date: 'Total', quantity: consumption.total },
  };
  const photoSection: ReportSection = {
    title: 'Fotografías',
    columns: [
      { key: 'date', label: 'Fecha y hora' },
      { key: 'type', label: 'Tipo' },
      { key: 'user', label: 'Usuario' },
      { key: 'task', label: 'Tarea' },
    ],
    rows: photos.map((p) => ({ date: fmtDateTime(p.takenAt), type: label(p.type), user: p.user.name, task: p.task ? `#${p.task.id}` : '' })),
    images: photos
      .filter((p) => /jpe?g|png/.test(p.mime))
      .slice(0, 12)
      .map((p) => ({ path: p.path, caption: `${label(p.type)} · ${fmtDateTime(p.takenAt)} · ${p.user.name}` })),
  };
  return {
    kpis: [...consumption.sections[0].rows.map((r) => ({ label: String(r.product), value: qty(Number(r.quantity), String(r.unit)) })), ...tasksR.kpis.slice(0, 2), incidentsR.kpis[0]],
    sections: [info, consumption.sections[0], fillingDetail, ...tasksR.sections, incidentsR.sections[2], photoSection],
  };
}

async function general(c: Ctx) {
  const ids = await accessiblePointIds(c.user);
  const points = await prisma.washPoint.findMany({
    where: { companyId: c.user.companyId, ...(ids ? { id: { in: ids } } : {}), ...(c.f.pointId ? { id: c.f.pointId } : {}) },
    orderBy: { name: 'asc' },
  });
  const [consumption, tasksR, inv, incR, fills] = await Promise.all([consumoPunto(c), tareas(c), inventorySection(c), incidencias(c), fillings(c)]);
  const tasks = await taskList(c);
  const incidents = await incidentList(c);
  const pointsSection: ReportSection = {
    title: 'Resumen de puntos',
    columns: [
      { key: 'code', label: 'Código' },
      { key: 'name', label: 'Punto' },
      { key: 'city', label: 'Ciudad' },
      { key: 'status', label: 'Estado' },
      { key: 'tasks', label: 'Tareas', align: 'right' },
      { key: 'completed', label: 'Completadas', align: 'right' },
      { key: 'consumption', label: 'Consumo', align: 'right' },
      { key: 'incidents', label: 'Incidencias', align: 'right' },
    ],
    rows: points.map((p) => ({
      code: p.code,
      name: p.name,
      city: p.city,
      status: p.active ? 'Activo' : 'Inactivo',
      tasks: tasks.filter((t) => t.pointId === p.id).length,
      completed: tasks.filter((t) => t.pointId === p.id && t.status === TaskStatus.COMPLETADA).length,
      consumption: unitTotals(fills.filter((f) => f.pointId === p.id)),
      incidents: incidents.filter((i) => i.pointId === p.id).length,
    })),
  };
  return {
    kpis: [
      { label: 'Puntos', value: `${points.length} (${points.filter((p) => p.active).length} activos)` },
      ...tasksR.kpis.slice(0, 4),
      consumption.kpis[0],
      { label: 'Incidencias', value: String(incidents.length) },
      { label: 'Productos con stock bajo', value: String(inv.rows.filter((r) => r.alert).length) },
    ],
    sections: [pointsSection, tasksR.sections[0], consumption.sections[0], inv, incR.sections[0], incR.sections[1]],
  };
}

const BUILDERS: Record<ReportType, (c: Ctx) => Promise<{ kpis: Report['kpis']; sections: ReportSection[] }>> = {
  'consumo-productos': consumoProductos,
  'consumo-punto': consumoPunto,
  tareas,
  trabajador,
  incidencias,
  inventario,
  punto,
  general,
};

export async function buildReport(user: AuthUser, type: ReportType, f: ReportFilters): Promise<Report> {
  const range = dateRange(f.from, f.to)!;
  const scope = await pointFilter(user, f.pointId);
  const c: Ctx = { user, f, range, scope };
  const [settings, point, product, filterUser] = await Promise.all([
    getSettings(user.companyId),
    f.pointId ? prisma.washPoint.findUnique({ where: { id: f.pointId }, select: { name: true } }) : null,
    f.productId ? prisma.product.findUnique({ where: { id: f.productId }, select: { name: true } }) : null,
    f.userId ? prisma.user.findUnique({ where: { id: f.userId }, select: { name: true } }) : null,
  ]);
  const { kpis, sections } = await BUILDERS[type](c);
  const filters = [
    { label: 'Punto', value: point?.name ?? 'Todos' },
    { label: 'Producto', value: product?.name ?? 'Todos' },
    { label: 'Usuario', value: filterUser?.name ?? 'Todos' },
    { label: 'Estado', value: f.status ? label(f.status) : 'Todos' },
  ];
  return {
    type,
    title: REPORT_TYPES[type] + (type === 'punto' && point ? ` — ${point.name}` : ''),
    companyName: settings.companyName,
    generatedAt: fmtDateTime(new Date()),
    period: { from: fmtDate(range.gte), to: fmtDate(range.lte) },
    filters,
    kpis,
    sections,
  };
}
