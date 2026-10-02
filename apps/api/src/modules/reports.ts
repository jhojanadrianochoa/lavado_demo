import { Router } from 'express';
import { Role } from '@prisma/client';
import { z } from 'zod';
import { audit } from '../lib/audit.js';
import { ah } from '../lib/errors.js';
import { listQuery, parse } from '../lib/query.js';
import { getSettings } from '../lib/settings.js';
import { buildReport } from '../reports/builders.js';
import { renderCsv } from '../reports/csv.js';
import { renderExcel } from '../reports/excel.js';
import { renderPdf } from '../reports/pdf.js';
import { REPORT_TYPES, type ReportType } from '../reports/types.js';
import { currentUser, requireRole } from '../middleware/auth.js';

export const reportsRouter = Router();

reportsRouter.get('/types', (_req, res) => {
  res.json(Object.entries(REPORT_TYPES).map(([value, label]) => ({ value, label })));
});

reportsRouter.get(
  '/:type',
  requireRole(Role.ADMIN, Role.SUPERVISOR),
  ah(async (req, res) => {
    const me = currentUser(req);
    const type = parse(z.enum(Object.keys(REPORT_TYPES) as [ReportType, ...ReportType[]]), req.params.type);
    const q = parse(listQuery.extend({ format: z.enum(['json', 'pdf', 'xlsx', 'csv']).default('json') }), req.query);
    const today = new Date();
    const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const from = q.from ?? iso(new Date(today.getFullYear(), today.getMonth(), 1));
    const to = q.to ?? iso(today);
    const report = await buildReport(me, type, { from, to, pointId: q.pointId, productId: q.productId, userId: q.userId, status: q.status });
    const filename = `${type}_${from}_${to}`;
    if (q.format === 'json') return res.json(report);
    await audit(req, 'REPORT_EXPORTED', 'Report', null, { type, format: q.format, from, to });
    if (q.format === 'pdf') {
      const settings = await getSettings(me.companyId);
      const pdf = await renderPdf(report, settings.logoPath || null);
      res.setHeader('Content-Disposition', `attachment; filename="${filename}.pdf"`);
      return res.type('application/pdf').send(pdf);
    }
    if (q.format === 'xlsx') {
      res.setHeader('Content-Disposition', `attachment; filename="${filename}.xlsx"`);
      return res.type('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet').send(await renderExcel(report));
    }
    res.setHeader('Content-Disposition', `attachment; filename="${filename}.csv"`);
    res.type('text/csv; charset=utf-8').send(renderCsv(report));
  }),
);
