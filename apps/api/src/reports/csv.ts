import type { Cell, Report } from './types.js';

const esc = (v: Cell | undefined) => {
  const s = v === null || v === undefined ? '' : String(v);
  return /[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** CSV con separador ';' (compatible con Excel en configuración regional español) y BOM UTF-8. */
export function renderCsv(report: Report): Buffer {
  const lines: string[] = [];
  const row = (cells: (Cell | undefined)[]) => lines.push(cells.map(esc).join(';'));
  row([report.companyName]);
  row([report.title]);
  row(['Fecha de generación', report.generatedAt]);
  row(['Período analizado', `${report.period.from} - ${report.period.to}`]);
  for (const f of report.filters) row([`Filtro: ${f.label}`, f.value]);
  lines.push('');
  for (const k of report.kpis) row([k.label, k.value]);
  for (const s of report.sections) {
    lines.push('');
    row([s.title]);
    row(s.columns.map((c) => c.label));
    for (const r of s.rows) row(s.columns.map((c) => r[c.key]));
    if (s.totals) row(s.columns.map((c) => s.totals![c.key]));
  }
  return Buffer.from('\uFEFF' + lines.join('\r\n'), 'utf8');
}
