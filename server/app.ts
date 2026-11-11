import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import type { Db } from './db';
import { makeAuth } from './auth';
import { errorHandler, wrap } from './util';
import { animalRoutes } from './routes/animals';
import { feedRoutes } from './routes/feed';
import { financeCrudRoutes } from './routes/finance-crud';
import { milkRoutes } from './routes/milk';
import { reportRoutes } from './routes/reports';
import { settingsRoutes } from './routes/settings';

export interface AppOptions {
  appPassword?: string;
  sessionSecret: string;
  staticDir?: string;
}

export function createApp(db: Db, opts: AppOptions) {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '200kb' }));
  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'same-origin');
    next();
  });

  const auth = makeAuth({ password: opts.appPassword, secret: opts.sessionSecret });
  const api = express.Router();

  api.get('/health', wrap(async (_req, res) => {
    await db.query('select 1');
    res.json({ ok: true, db: db.mode, authRequired: auth.enabled });
  }));
  api.post('/login', (req, res, next) => {
    try { res.json({ token: auth.login(req.body?.password) }); } catch (e) { next(e); }
  });

  api.use(auth.middleware);
  api.use(settingsRoutes(db));
  api.use(animalRoutes(db));
  api.use(milkRoutes(db));
  api.use(feedRoutes(db));
  api.use(financeCrudRoutes(db));
  api.use(reportRoutes(db));
  api.use((_req, res) => { res.status(404).json({ error: 'Topilmadi' }); });

  app.use('/api', api);

  if (opts.staticDir && fs.existsSync(opts.staticDir)) {
    app.use(express.static(opts.staticDir, { index: false, maxAge: '1h' }));
    app.get('*', (_req, res) => res.sendFile(path.join(opts.staticDir!, 'index.html')));
  }

  app.use(errorHandler);
  return app;
}
