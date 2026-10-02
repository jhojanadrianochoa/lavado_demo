import 'dotenv/config';
import path from 'node:path';

process.env.TZ ??= 'America/Bogota';

function required(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (!value) throw new Error(`Falta la variable de entorno ${name}`);
  return value;
}

export const config = {
  port: Number(process.env.PORT ?? 4000),
  jwtSecret: required('JWT_SECRET', process.env.NODE_ENV === 'production' ? undefined : 'dev-secret-change-me'),
  sessionHours: Number(process.env.SESSION_HOURS ?? 12),
  cookieSecure: process.env.COOKIE_SECURE === 'true',
  uploadDir: path.resolve(process.env.UPLOAD_DIR ?? './uploads'),
  webDist: process.env.WEB_DIST ? path.resolve(process.env.WEB_DIST) : undefined,
  maxUploadMb: Number(process.env.MAX_UPLOAD_MB ?? 10),
};
