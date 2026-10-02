import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { config } from './config.js';
import { notFound } from './lib/errors.js';
import { requireAuth } from './middleware/auth.js';
import { errorHandler } from './middleware/errorHandler.js';
import { authRouter } from './modules/auth.js';
import { dashboardRouter } from './modules/dashboard.js';
import { fillingsRouter } from './modules/fillings.js';
import { historyRouter } from './modules/history.js';
import { incidentsRouter } from './modules/incidents.js';
import { inventoryRouter } from './modules/inventory.js';
import { notificationsRouter } from './modules/notifications.js';
import { photosRouter } from './modules/photos.js';
import { pointsRouter } from './modules/points.js';
import { productsRouter } from './modules/products.js';
import { reportsRouter } from './modules/reports.js';
import { requirementsRouter } from './modules/requirements.js';
import { publicSettingsRouter, settingsRouter } from './modules/settings.js';
import { tasksRouter } from './modules/tasks.js';
import { usersRouter } from './modules/users.js';

export function createApp() {
  const app = express();
  app.set('trust proxy', 1);
  app.disable('x-powered-by');
  app.use(helmet({ contentSecurityPolicy: false, crossOriginResourcePolicy: { policy: 'same-origin' } }));
  app.use(express.json({ limit: '1mb' }));
  app.use(cookieParser());

  const api = express.Router();
  api.get('/health', (_req, res) => res.json({ ok: true }));
  api.use('/auth', authRouter);
  api.use('/public', publicSettingsRouter);
  api.use('/settings', settingsRouter);
  api.use('/users', requireAuth, usersRouter);
  api.use('/points', requireAuth, pointsRouter);
  api.use('/products', requireAuth, productsRouter);
  api.use('/inventory', requireAuth, inventoryRouter);
  api.use('/requirements', requireAuth, requirementsRouter);
  api.use('/tasks', requireAuth, tasksRouter);
  api.use('/fillings', requireAuth, fillingsRouter);
  api.use('/photos', requireAuth, photosRouter);
  api.use('/incidents', requireAuth, incidentsRouter);
  api.use('/notifications', requireAuth, notificationsRouter);
  api.use('/dashboard', requireAuth, dashboardRouter);
  api.use('/history', requireAuth, historyRouter);
  api.use('/reports', requireAuth, reportsRouter);
  api.use((_req, _res, next) => next(notFound('Ruta no encontrada')));
  app.use('/api', api);

  if (config.webDist && fs.existsSync(config.webDist)) {
    const dist = config.webDist;
    app.use(express.static(dist, { index: false, maxAge: '7d' }));
    app.get('*', (_req, res) => res.sendFile(path.join(dist, 'index.html')));
  }

  app.use(errorHandler);
  return app;
}
