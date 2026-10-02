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
};

export const label = (v: string | null | undefined) => (v ? (LABELS[v] ?? v) : '');

export const fmtDate = (d: Date | null | undefined) => (d ? d.toLocaleDateString('es-CO', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '');
export const fmtDateTime = (d: Date | null | undefined) =>
  d ? d.toLocaleString('es-CO', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }) : '';
export const round2 = (n: number) => Math.round(n * 100) / 100;
