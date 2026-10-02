export type Cell = string | number | null;

export interface ReportColumn {
  key: string;
  label: string;
  align?: 'left' | 'right';
  width?: number;
}

export interface ReportChart {
  title: string;
  labelKey: string;
  valueKey: string;
}

export interface ReportSection {
  title: string;
  columns: ReportColumn[];
  rows: Record<string, Cell>[];
  totals?: Record<string, Cell>;
  chart?: ReportChart;
  images?: { path: string; caption: string }[];
  emptyText?: string;
}

export interface Report {
  type: string;
  title: string;
  companyName: string;
  generatedAt: string;
  period: { from: string; to: string };
  filters: { label: string; value: string }[];
  kpis: { label: string; value: string }[];
  sections: ReportSection[];
}

export const REPORT_TYPES = {
  'consumo-productos': 'Informe de consumo de productos',
  'consumo-punto': 'Informe de consumo por punto',
  tareas: 'Informe de tareas',
  trabajador: 'Informe por trabajador',
  incidencias: 'Informe de incidencias',
  inventario: 'Informe de inventario',
  punto: 'Informe individual del punto',
  general: 'Informe general',
} as const;
export type ReportType = keyof typeof REPORT_TYPES;
