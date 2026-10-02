export const LABELS: Record<string, string> = {
  PENDIENTE: 'Pendiente',
  ASIGNADA: 'Asignada',
  ASIGNADO: 'Asignado',
  EN_PROCESO: 'En proceso',
  COMPLETADA: 'Completada',
  COMPLETADO: 'Completado',
  CANCELADA: 'Cancelada',
  CANCELADO: 'Cancelado',
  ABIERTA: 'Abierta',
  SOLUCIONADA: 'Solucionada',
  CERRADA: 'Cerrada',
  BAJA: 'Baja',
  MEDIA: 'Media',
  ALTA: 'Alta',
  URGENTE: 'Urgente',
  LLENADO: 'Llenado',
  MANTENIMIENTO: 'Mantenimiento',
  REVISION: 'Revisión',
  LIMPIEZA: 'Limpieza',
  OTRO: 'Otro',
  LLENADO_PRODUCTO: 'Llenado de producto',
  REVISION_BOMBA: 'Revisión de bomba',
  REVISION_MANGUERA: 'Revisión de manguera',
  FUGA: 'Fuga',
  MANGUERA_DANADA: 'Manguera dañada',
  BOMBA_DANADA: 'Bomba dañada',
  DOSIFICADOR_DEFECTUOSO: 'Dosificador defectuoso',
  TANQUE_DANADO: 'Tanque dañado',
  PROBLEMA_ELECTRICO: 'Problema eléctrico',
  FALTA_PRODUCTO: 'Falta de producto',
  ENTRADA: 'Entrada',
  SALIDA: 'Salida',
  AJUSTE: 'Ajuste',
  ANTES: 'Antes',
  DESPUES: 'Después',
  INCIDENCIA: 'Incidencia',
  ADICIONAL: 'Adicional',
  ADMIN: 'Administrador',
  SUPERVISOR: 'Supervisor',
  WORKER: 'Trabajador',
  TAREA: 'Tarea',
  REQUERIMIENTO: 'Requerimiento',
  INVENTARIO: 'Inventario',
  FOTO: 'Fotografía',
};

export const label = (v: string | null | undefined) => (v ? (LABELS[v] ?? v) : '');

export const fmtDate = (v: string | null | undefined) =>
  v ? new Date(v).toLocaleDateString('es-CO', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—';

export const fmtDateTime = (v: string | null | undefined) =>
  v ? new Date(v).toLocaleString('es-CO', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }) : '—';

export const fmtNum = (n: number | null | undefined, digits = 2) =>
  n === null || n === undefined ? '—' : n.toLocaleString('es-CO', { maximumFractionDigits: digits });

export const fmtQty = (n: number, unit: string) => `${fmtNum(n)} ${unit}`;

export const isoDate = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export const monthStart = () => {
  const d = new Date();
  return isoDate(new Date(d.getFullYear(), d.getMonth(), 1));
};
export const today = () => isoDate(new Date());

/** Valor para <input type="datetime-local"> */
export const toLocalInput = (v: string | Date | null | undefined) => {
  if (!v) return '';
  const d = new Date(v);
  return `${isoDate(d)}T${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

export const STATUS_COLORS: Record<string, string> = {
  PENDIENTE: 'bg-amber-100 text-amber-800',
  ASIGNADA: 'bg-sky-100 text-sky-800',
  ASIGNADO: 'bg-sky-100 text-sky-800',
  EN_PROCESO: 'bg-indigo-100 text-indigo-800',
  COMPLETADA: 'bg-emerald-100 text-emerald-800',
  COMPLETADO: 'bg-emerald-100 text-emerald-800',
  CANCELADA: 'bg-slate-200 text-slate-600',
  CANCELADO: 'bg-slate-200 text-slate-600',
  ABIERTA: 'bg-red-100 text-red-800',
  SOLUCIONADA: 'bg-emerald-100 text-emerald-800',
  CERRADA: 'bg-slate-200 text-slate-600',
  BAJA: 'bg-slate-100 text-slate-600',
  MEDIA: 'bg-sky-100 text-sky-800',
  ALTA: 'bg-orange-100 text-orange-800',
  URGENTE: 'bg-red-600 text-white',
  ENTRADA: 'bg-emerald-100 text-emerald-800',
  SALIDA: 'bg-orange-100 text-orange-800',
  AJUSTE: 'bg-violet-100 text-violet-800',
  LLENADO: 'bg-brand-100 text-brand-800',
};

export const CHART_COLORS = ['#0e7490', '#06b6d4', '#f59e0b', '#10b981', '#6366f1', '#ef4444', '#8b5cf6', '#84cc16', '#ec4899', '#64748b'];

export const STATUS_CHART_COLORS: Record<string, string> = {
  PENDIENTE: '#f59e0b',
  ASIGNADA: '#0ea5e9',
  EN_PROCESO: '#6366f1',
  COMPLETADA: '#10b981',
  CANCELADA: '#94a3b8',
  ABIERTA: '#ef4444',
  SOLUCIONADA: '#10b981',
  CERRADA: '#94a3b8',
};
