import { Router } from 'express';
import multer from 'multer';
import { PhotoType, Prisma, Role } from '@prisma/client';
import { z } from 'zod';
import { config } from '../config.js';
import type { AuthUser } from '../lib/auth.js';
import { audit } from '../lib/audit.js';
import { ah, badRequest, forbidden, notFound } from '../lib/errors.js';
import { prisma } from '../lib/prisma.js';
import { dateRange, idParam, listQuery, optionalDateTime, optionalFk, optionalText, paginate, parse } from '../lib/query.js';
import { accessiblePointIds, pointFilter } from '../lib/scope.js';
import { storage } from '../lib/storage.js';
import { currentUser } from '../middleware/auth.js';

export const photosRouter = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: config.maxUploadMb * 1024 * 1024, files: 10 },
  fileFilter: (_req, file, cb) => {
    if (/^image\/(jpeg|png|webp|heic|heif)$/.test(file.mimetype)) cb(null, true);
    else cb(badRequest('Solo se permiten imágenes (JPG, PNG, WEBP)'));
  },
});

const userMini = { select: { id: true, name: true } } as const;
const include = {
  user: userMini,
  point: { select: { id: true, name: true, code: true } },
  task: { select: { id: true, description: true } },
  incident: { select: { id: true, type: true } },
} satisfies Prisma.PhotoInclude;

async function canSeePhoto(user: AuthUser, photo: { userId: number; pointId: number; taskId: number | null }) {
  if (user.role === Role.ADMIN || photo.userId === user.id) return true;
  if (user.role === Role.WORKER && photo.taskId) {
    const task = await prisma.task.findUnique({ where: { id: photo.taskId }, select: { assigneeId: true } });
    if (task?.assigneeId === user.id) return true;
  }
  if (user.role === Role.SUPERVISOR) {
    const ids = await accessiblePointIds(user);
    return !ids || ids.includes(photo.pointId);
  }
  return false;
}

photosRouter.get(
  '/',
  ah(async (req, res) => {
    const me = currentUser(req);
    const q = parse(
      listQuery.extend({
        taskId: z.coerce.number().int().positive().optional(),
        incidentId: z.coerce.number().int().positive().optional(),
        fillingId: z.coerce.number().int().positive().optional(),
      }),
      req.query,
    );
    const where: Prisma.PhotoWhereInput = { ...(await pointFilter(me, q.pointId)) };
    if (me.role === Role.WORKER) where.OR = [{ userId: me.id }, { task: { assigneeId: me.id } }];
    else if (q.userId) where.userId = q.userId;
    if (q.taskId) where.taskId = q.taskId;
    if (q.incidentId) where.incidentId = q.incidentId;
    if (q.fillingId) where.fillingId = q.fillingId;
    if (q.type) where.type = q.type as PhotoType;
    const range = dateRange(q.from, q.to);
    if (range) where.takenAt = range;
    const [items, total] = await Promise.all([
      prisma.photo.findMany({ where, include, orderBy: { takenAt: 'desc' }, ...paginate(q) }),
      prisma.photo.count({ where }),
    ]);
    res.json({ items, total, page: q.page, pageSize: q.pageSize });
  }),
);

photosRouter.post(
  '/',
  upload.array('files', 10),
  ah(async (req, res) => {
    const me = currentUser(req);
    const files = (req.files as Express.Multer.File[] | undefined) ?? [];
    if (!files.length) throw badRequest('Adjunte al menos una fotografía');
    const body = parse(
      z.object({
        type: z.nativeEnum(PhotoType).default(PhotoType.ADICIONAL),
        taskId: optionalFk,
        incidentId: optionalFk,
        fillingId: optionalFk,
        pointId: optionalFk,
        caption: optionalText,
        takenAt: optionalDateTime,
      }),
      req.body,
    );
    let pointId = body.pointId ?? null;
    let taskId = body.taskId ?? null;
    if (body.fillingId) {
      const filling = await prisma.filling.findUnique({ where: { id: body.fillingId } });
      if (!filling) throw notFound('Llenado no encontrado');
      if (me.role === Role.WORKER && filling.userId !== me.id) throw forbidden();
      pointId = filling.pointId;
      taskId = taskId ?? filling.taskId;
    }
    if (body.incidentId) {
      const incident = await prisma.incident.findUnique({ where: { id: body.incidentId } });
      if (!incident) throw notFound('Incidencia no encontrada');
      if (me.role === Role.WORKER && incident.reportedById !== me.id && incident.assigneeId !== me.id) throw forbidden();
      pointId = incident.pointId;
      taskId = taskId ?? incident.taskId;
    }
    if (taskId) {
      const task = await prisma.task.findUnique({ where: { id: taskId } });
      if (!task) throw notFound('Tarea no encontrada');
      if (me.role === Role.WORKER && task.assigneeId !== me.id) throw forbidden('Esta tarea no está asignada a usted');
      pointId = task.pointId;
    }
    if (!pointId) throw badRequest('Indique la tarea, incidencia o punto de la fotografía');
    const ids = await accessiblePointIds(me);
    if (ids && !ids.includes(pointId) && !(me.role === Role.WORKER && taskId)) throw forbidden('No tiene acceso a este punto');

    const created = [];
    for (const file of files) {
      const rel = await storage.save(file.buffer, file.originalname, 'photos');
      created.push(
        await prisma.photo.create({
          data: {
            path: rel,
            mime: file.mimetype,
            size: file.size,
            type: body.type,
            caption: body.caption ?? null,
            pointId,
            taskId,
            incidentId: body.incidentId ?? null,
            fillingId: body.fillingId ?? null,
            userId: me.id,
            takenAt: body.takenAt ?? new Date(),
          },
          include,
        }),
      );
    }
    res.status(201).json(created);
  }),
);

photosRouter.get(
  '/:id/file',
  ah(async (req, res) => {
    const me = currentUser(req);
    const { id } = parse(idParam, req.params);
    const photo = await prisma.photo.findUnique({ where: { id } });
    if (!photo) throw notFound('Fotografía no encontrada');
    if (!(await canSeePhoto(me, photo))) throw forbidden();
    res.setHeader('Cache-Control', 'private, max-age=86400');
    res.type(photo.mime).sendFile(storage.absolutePath(photo.path));
  }),
);

photosRouter.delete(
  '/:id',
  ah(async (req, res) => {
    const me = currentUser(req);
    const { id } = parse(idParam, req.params);
    const photo = await prisma.photo.findUnique({ where: { id } });
    if (!photo) throw notFound('Fotografía no encontrada');
    if (me.role !== Role.ADMIN && photo.userId !== me.id) throw forbidden();
    await prisma.photo.delete({ where: { id } });
    await storage.remove(photo.path);
    await audit(req, 'PHOTO_DELETED', 'Photo', id, { taskId: photo.taskId, pointId: photo.pointId });
    res.json({ ok: true });
  }),
);
