import { Router } from 'express';
import multer from 'multer';
import { Role } from '@prisma/client';
import { z } from 'zod';
import { audit } from '../lib/audit.js';
import { INCIDENT_TYPES, REQUIREMENT_TYPES, TASK_TYPES, UNITS } from '../lib/catalogs.js';
import { ah, badRequest } from '../lib/errors.js';
import { prisma } from '../lib/prisma.js';
import { listQuery, paginate, parse, dateRange } from '../lib/query.js';
import { getSettings, setSetting } from '../lib/settings.js';
import { storage } from '../lib/storage.js';
import { currentUser, requireAuth, requireRole } from '../middleware/auth.js';

export const settingsRouter = Router();
export const publicSettingsRouter = Router();

const logoUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (/^image\/(jpeg|png)$/.test(file.mimetype)) cb(null, true);
    else cb(badRequest('El logo debe ser PNG o JPG'));
  },
});

async function defaultCompanyId() {
  const company = await prisma.company.findFirst({ orderBy: { id: 'asc' } });
  return company?.id ?? 1;
}

publicSettingsRouter.get(
  '/branding',
  ah(async (_req, res) => {
    const s = await getSettings(await defaultCompanyId());
    res.json({ companyName: s.companyName, hasLogo: Boolean(s.logoPath) });
  }),
);

publicSettingsRouter.get(
  '/logo',
  ah(async (_req, res) => {
    const s = await getSettings(await defaultCompanyId());
    if (!s.logoPath) return res.status(404).end();
    res.setHeader('Cache-Control', 'no-cache');
    res.sendFile(storage.absolutePath(s.logoPath));
  }),
);

settingsRouter.get(
  '/catalogs',
  requireAuth,
  (_req, res) => {
    res.json({ taskTypes: TASK_TYPES, requirementTypes: REQUIREMENT_TYPES, incidentTypes: INCIDENT_TYPES, units: UNITS });
  },
);

settingsRouter.get(
  '/',
  requireAuth,
  ah(async (req, res) => {
    const s = await getSettings(currentUser(req).companyId);
    res.json({ ...s, hasLogo: Boolean(s.logoPath) });
  }),
);

settingsRouter.put(
  '/',
  requireAuth,
  requireRole(Role.ADMIN),
  ah(async (req, res) => {
    const me = currentUser(req);
    const body = parse(
      z.object({
        companyName: z.string().trim().min(2).max(120),
        autoDeductInventory: z.boolean(),
        requirePhotoOnComplete: z.boolean(),
        dueSoonHours: z.coerce.number().int().min(1).max(720),
      }),
      req.body,
    );
    await setSetting(me.companyId, 'companyName', body.companyName);
    await setSetting(me.companyId, 'autoDeductInventory', String(body.autoDeductInventory));
    await setSetting(me.companyId, 'requirePhotoOnComplete', String(body.requirePhotoOnComplete));
    await setSetting(me.companyId, 'dueSoonHours', String(body.dueSoonHours));
    await prisma.company.update({ where: { id: me.companyId }, data: { name: body.companyName } });
    await audit(req, 'SETTINGS_UPDATED', 'Setting', null, body);
    res.json(await getSettings(me.companyId));
  }),
);

settingsRouter.post(
  '/logo',
  requireAuth,
  requireRole(Role.ADMIN),
  logoUpload.single('file'),
  ah(async (req, res) => {
    const me = currentUser(req);
    if (!req.file) throw badRequest('Adjunte una imagen');
    const prev = await getSettings(me.companyId);
    const rel = await storage.save(req.file.buffer, req.file.originalname, 'branding');
    await setSetting(me.companyId, 'logoPath', rel);
    if (prev.logoPath) await storage.remove(prev.logoPath);
    await audit(req, 'LOGO_UPDATED', 'Setting');
    res.json({ ok: true });
  }),
);

settingsRouter.get(
  '/audit',
  requireAuth,
  requireRole(Role.ADMIN),
  ah(async (req, res) => {
    const q = parse(listQuery.extend({ entity: z.string().optional(), action: z.string().optional() }), req.query);
    const where = {
      ...(q.userId ? { userId: q.userId } : {}),
      ...(q.entity ? { entity: q.entity } : {}),
      ...(q.action ? { action: q.action } : {}),
      ...(dateRange(q.from, q.to) ? { createdAt: dateRange(q.from, q.to) } : {}),
    };
    const [items, total] = await Promise.all([
      prisma.auditLog.findMany({ where, include: { user: { select: { id: true, name: true, username: true } } }, orderBy: { createdAt: 'desc' }, ...paginate(q) }),
      prisma.auditLog.count({ where }),
    ]);
    res.json({ items, total, page: q.page, pageSize: q.pageSize });
  }),
);
