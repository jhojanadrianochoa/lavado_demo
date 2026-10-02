export const TASK_TYPES = ['LLENADO', 'MANTENIMIENTO', 'REVISION', 'LIMPIEZA', 'OTRO'] as const;
export const REQUIREMENT_TYPES = [
  'LLENADO_PRODUCTO',
  'REVISION_BOMBA',
  'REVISION_MANGUERA',
  'MANTENIMIENTO',
  'OTRO',
] as const;
export const INCIDENT_TYPES = [
  'FUGA',
  'MANGUERA_DANADA',
  'BOMBA_DANADA',
  'DOSIFICADOR_DEFECTUOSO',
  'TANQUE_DANADO',
  'PROBLEMA_ELECTRICO',
  'FALTA_PRODUCTO',
  'OTRO',
] as const;
export const UNITS = ['L', 'mL', 'gal', 'kg', 'g', 'unidad'] as const;

/** Tipo de tarea sugerido al convertir un requerimiento. */
export function taskTypeForRequirement(type: string): string {
  if (type === 'LLENADO_PRODUCTO') return 'LLENADO';
  if (type === 'REVISION_BOMBA' || type === 'REVISION_MANGUERA') return 'REVISION';
  if (type === 'MANTENIMIENTO') return 'MANTENIMIENTO';
  return 'OTRO';
}
