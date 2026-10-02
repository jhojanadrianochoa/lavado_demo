import type { NextFunction, Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import multer from 'multer';
import { HttpError } from '../lib/errors.js';

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof HttpError) {
    return res.status(err.status).json({ message: err.message, details: err.details });
  }
  if (err instanceof multer.MulterError) {
    return res.status(400).json({ message: `Error al subir archivo: ${err.message}` });
  }
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === 'P2002') {
      return res.status(409).json({ message: 'Ya existe un registro con ese valor único', details: err.meta });
    }
    if (err.code === 'P2025') return res.status(404).json({ message: 'Recurso no encontrado' });
    if (err.code === 'P2003') return res.status(400).json({ message: 'Referencia inválida a otro registro' });
  }
  console.error(err);
  res.status(500).json({ message: 'Error interno del servidor' });
}
