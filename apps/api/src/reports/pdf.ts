import fs from 'node:fs';
import PDFDocument from 'pdfkit';
import { storage } from '../lib/storage.js';
import type { Cell, Report, ReportSection } from './types.js';

const BRAND = '#0e7490';
const MUTED = '#64748b';
const BORDER = '#e2e8f0';
const MARGIN = 36;

const text = (v: Cell | undefined) => (v === null || v === undefined ? '' : typeof v === 'number' ? v.toLocaleString('es-CO') : String(v));

export function renderPdf(report: Report, logoPath: string | null): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: MARGIN, bufferPages: true, info: { Title: report.title, Author: report.companyName } });
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const width = doc.page.width - MARGIN * 2;
    const bottom = () => doc.page.height - MARGIN - 20;
    const ensure = (h: number) => {
      if (doc.y + h > bottom()) doc.addPage();
    };

    // Encabezado
    let headerX = MARGIN;
    if (logoPath) {
      try {
        const abs = storage.absolutePath(logoPath);
        if (fs.existsSync(abs)) {
          doc.image(abs, MARGIN, MARGIN, { fit: [90, 50] });
          headerX = MARGIN + 100;
        }
      } catch {
        headerX = MARGIN;
      }
    }
    doc.fillColor(BRAND).font('Helvetica-Bold').fontSize(18).text(report.companyName, headerX, MARGIN, { width: width - (headerX - MARGIN) });
    doc.fillColor('#0f172a').fontSize(14).text(report.title, headerX, doc.y + 2, { width: width - (headerX - MARGIN) });
    doc.font('Helvetica').fontSize(9).fillColor(MUTED);
    doc.text(`Fecha de generación: ${report.generatedAt}    Período analizado: ${report.period.from} - ${report.period.to}`, headerX, doc.y + 4);
    doc.text(`Filtros: ${report.filters.map((f) => `${f.label}: ${f.value}`).join('  ·  ')}`, headerX, doc.y + 2);
    doc.y = Math.max(doc.y, MARGIN + 56) + 8;
    doc.moveTo(MARGIN, doc.y).lineTo(MARGIN + width, doc.y).strokeColor(BRAND).lineWidth(1.5).stroke();
    doc.y += 10;

    // Indicadores
    if (report.kpis.length) {
      const perRow = Math.min(report.kpis.length, 5);
      const boxW = (width - (perRow - 1) * 8) / perRow;
      const boxH = 42;
      report.kpis.forEach((k, i) => {
        const col = i % perRow;
        if (col === 0 && i > 0) doc.y += boxH + 8;
        if (col === 0) ensure(boxH + 8);
        const x = MARGIN + col * (boxW + 8);
        const y = doc.y;
        doc.roundedRect(x, y, boxW, boxH, 4).fillAndStroke('#f0f9ff', BORDER);
        doc.fillColor(MUTED).font('Helvetica').fontSize(8).text(k.label, x + 8, y + 7, { width: boxW - 16, lineBreak: false, ellipsis: true });
        doc.fillColor('#0f172a').font('Helvetica-Bold').fontSize(12).text(k.value, x + 8, y + 20, { width: boxW - 16, lineBreak: false, ellipsis: true });
        doc.y = y;
      });
      doc.y += boxH + 14;
    }

    for (const section of report.sections) drawSection(doc, section, width, ensure);

    const range = doc.bufferedPageRange();
    for (let i = range.start; i < range.start + range.count; i++) {
      doc.switchToPage(i);
      doc.page.margins.bottom = 0;
      doc.font('Helvetica').fontSize(8).fillColor(MUTED);
      doc.text(`${report.companyName} · ${report.title}`, MARGIN, doc.page.height - MARGIN - 4, { lineBreak: false });
      doc.text(`Página ${i + 1} de ${range.count}`, MARGIN, doc.page.height - MARGIN - 4, { width, align: 'right', lineBreak: false });
    }
    doc.end();
  });
}

function drawSection(doc: PDFKit.PDFDocument, section: ReportSection, width: number, ensure: (h: number) => void) {
  ensure(60);
  doc.x = MARGIN;
  doc.fillColor(BRAND).font('Helvetica-Bold').fontSize(12).text(section.title, MARGIN, doc.y);
  doc.y += 4;

  if (section.chart && section.rows.length) {
    const data = section.rows
      .map((r) => ({ label: text(r[section.chart!.labelKey]), value: Number(r[section.chart!.valueKey]) || 0 }))
      .filter((d) => d.value > 0)
      .slice(0, 12);
    if (data.length) {
      const barH = 14;
      const chartH = data.length * (barH + 4) + 22;
      ensure(chartH);
      doc.fillColor(MUTED).font('Helvetica').fontSize(8).text(section.chart.title, MARGIN, doc.y);
      const max = Math.max(...data.map((d) => d.value));
      const labelW = 150;
      const barMax = Math.min(width - labelW - 80, 450);
      let y = doc.y + 4;
      data.forEach((d, i) => {
        const w = Math.max(2, (d.value / max) * barMax);
        doc.fillColor('#334155').fontSize(8).text(d.label, MARGIN, y + 3, { width: labelW - 6, lineBreak: false, ellipsis: true });
        doc.rect(MARGIN + labelW, y, w, barH).fill(i % 2 ? '#22d3ee' : BRAND);
        doc.fillColor('#0f172a').text(d.value.toLocaleString('es-CO'), MARGIN + labelW + w + 4, y + 3, { lineBreak: false });
        y += barH + 4;
      });
      doc.y = y + 8;
    }
  }

  const cols = section.columns;
  if (!section.rows.length) {
    doc.fillColor(MUTED).font('Helvetica-Oblique').fontSize(9).text(section.emptyText ?? 'Sin datos para los filtros seleccionados.', MARGIN, doc.y);
    doc.y += 14;
  } else {
    const weights = cols.map((c) => {
      const longest = Math.max(c.label.length, ...section.rows.slice(0, 200).map((r) => text(r[c.key]).length));
      return Math.min(Math.max(longest, 4), 45);
    });
    const totalW = weights.reduce((a, b) => a + b, 0);
    const widths = weights.map((w) => (w / totalW) * width);
    const pad = 4;
    const fontSize = cols.length > 9 ? 7 : 8;

    const drawRow = (values: string[], opts: { header?: boolean; bold?: boolean; fill?: string }) => {
      doc.font(opts.header || opts.bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(fontSize);
      const h = Math.max(...values.map((v, i) => doc.heightOfString(v || ' ', { width: widths[i] - pad * 2 }))) + pad * 2;
      if (doc.y + h > doc.page.height - MARGIN - 20) {
        doc.addPage();
        if (!opts.header) drawRow(cols.map((c) => c.label), { header: true });
      }
      const y = doc.y;
      if (opts.fill) doc.rect(MARGIN, y, width, h).fill(opts.fill);
      let x = MARGIN;
      values.forEach((v, i) => {
        doc.fillColor(opts.header ? '#ffffff' : '#0f172a').font(opts.header || opts.bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(fontSize);
        doc.text(v, x + pad, y + pad, { width: widths[i] - pad * 2, align: cols[i].align === 'right' ? 'right' : 'left' });
        x += widths[i];
      });
      doc.moveTo(MARGIN, y + h).lineTo(MARGIN + width, y + h).strokeColor(BORDER).lineWidth(0.5).stroke();
      doc.y = y + h;
    };

    ensure(40);
    drawRow(cols.map((c) => c.label), { header: true, fill: BRAND });
    section.rows.forEach((r, i) => drawRow(cols.map((c) => text(r[c.key])), { fill: i % 2 ? '#f8fafc' : undefined }));
    if (section.totals) drawRow(cols.map((c) => text(section.totals![c.key])), { bold: true, fill: '#e0f2fe' });
    doc.y += 14;
  }

  if (section.images?.length) {
    const perRow = 4;
    const gap = 10;
    const w = (width - gap * (perRow - 1)) / perRow;
    const h = w * 0.75;
    section.images.forEach((img, i) => {
      const col = i % perRow;
      if (col === 0) {
        if (i > 0) doc.y += h + 22;
        ensure(h + 22);
      }
      const x = MARGIN + col * (w + gap);
      try {
        doc.image(storage.absolutePath(img.path), x, doc.y, { fit: [w, h], align: 'center', valign: 'center' });
      } catch {
        doc.rect(x, doc.y, w, h).stroke(BORDER);
      }
      doc.fillColor(MUTED).font('Helvetica').fontSize(7).text(img.caption, x, doc.y + h + 3, { width: w, lineBreak: false, ellipsis: true });
    });
    doc.y += h + 26;
  }
}
