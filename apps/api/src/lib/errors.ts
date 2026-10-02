import type { NextFunction, Request, Response, RequestHandler } from 'express';

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

export const badRequest = (msg: string, details?: unknown) => new HttpError(400, msg, details);
export const unauthorized = (msg = 'No autenticado') => new HttpError(401, msg);
export const forbidden = (msg = 'No tiene permisos para esta acción') => new HttpError(403, msg);
export const notFound = (msg = 'Recurso no encontrado') => new HttpError(404, msg);

type AsyncHandler = (req: Request, res: Response, next: NextFunction) => Promise<unknown>;

export function ah(fn: AsyncHandler): RequestHandler {
  return (req, res, next) => {
    fn(req, res, next).catch(next);
  };
}
