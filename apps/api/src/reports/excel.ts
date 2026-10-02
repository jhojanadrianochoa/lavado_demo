import ExcelJS from 'exceljs';
import type { Report } from './types.js';

export async function renderExcel(report: Report): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = report.companyName;
  wb.created = new Date();

  const summary = wb.addWorksheet('Resumen');
  summary.addRow([report.companyName]).font = { bold: true, size: 16, color: { argb: 'FF0E7490' } };
  summary.addRow([report.title]).font = { bold: true, size: 13 };
  summary.addRow(['Fecha de generación', report.generatedAt]);
  summary.addRow(['Período analizado', `${report.period.from} - ${report.period.to}`]);
  for (const f of report.filters) summary.addRow([`Filtro: ${f.label}`, f.value]);
  summary.addRow([]);
  summary.addRow(['Indicador', 'Valor']).font = { bold: true };
  for (const k of report.kpis) summary.addRow([k.label, k.value]);
  summary.getColumn(1).width = 32;
  summary.getColumn(2).width = 40;

  const used = new Set<string>(['Resumen']);
  report.sections.forEach((section, idx) => {
    let name = section.title.replace(/[\\/?*[\]:]/g, ' ').slice(0, 28).trim() || `Sección ${idx + 1}`;
    while (used.has(name)) name = `${name.slice(0, 25)} ${idx + 1}`;
    used.add(name);
    const ws = wb.addWorksheet(name);
    ws.addRow([section.title]).font = { bold: true, size: 13 };
    const header = ws.addRow(section.columns.map((c) => c.label));
    header.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    header.eachCell((cell) => {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0E7490' } };
    });
    for (const r of section.rows) ws.addRow(section.columns.map((c) => r[c.key] ?? ''));
    if (section.totals) {
      const t = ws.addRow(section.columns.map((c) => section.totals![c.key] ?? ''));
      t.font = { bold: true };
    }
    section.columns.forEach((c, i) => {
      const longest = Math.max(c.label.length, ...section.rows.map((r) => String(r[c.key] ?? '').length));
      ws.getColumn(i + 1).width = Math.min(Math.max(longest + 2, 8), 60);
    });
    ws.views = [{ state: 'frozen', ySplit: 2 }];
  });

  return Buffer.from(await wb.xlsx.writeBuffer());
}
