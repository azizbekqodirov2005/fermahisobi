import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createApp } from './app';
import { loadEnv } from './env';
import { migrate, openPglite, openPostgres } from './db';

loadEnv();

const PORT = Number(process.env.PORT ?? 3001);
// `npm start` yoki NODE_ENV=production — ishlab chiqarish rejimi (parol majburiy)
const isProd = process.env.NODE_ENV === 'production' || process.env.npm_lifecycle_event === 'start';
const appPassword = process.env.APP_PASSWORD || undefined;

if (isProd && !appPassword && process.env.ALLOW_NO_AUTH !== 'true') {
  console.error('XAVFSIZLIK: production rejimida APP_PASSWORD o‘rnatilishi shart (yoki ALLOW_NO_AUTH=true — tavsiya etilmaydi).');
  process.exit(1);
}
if (!appPassword) console.warn('[ogohlantirish] APP_PASSWORD o‘rnatilmagan — ilova parolsiz ochiq. Faqat mahalliy ishlash uchun.');

const sessionSecret = process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex');
if (appPassword && !process.env.SESSION_SECRET) console.warn('[ogohlantirish] SESSION_SECRET o‘rnatilmagan — server qayta ishga tushganda barcha foydalanuvchilar qayta kirishi kerak bo‘ladi.');

const db = process.env.DATABASE_URL
  ? await openPostgres(process.env.DATABASE_URL)
  : await openPglite(path.resolve(process.env.PGLITE_DIR ?? './data/pglite'));

const applied = await migrate(db);
if (applied.length) console.log(`[db] qo‘llangan migratsiyalar: ${applied.join(', ')}`);
console.log(db.mode === 'postgres'
  ? '[db] PostgreSQL (DATABASE_URL) ga ulandi — ma’lumotlar doimiy saqlanadi.'
  : `[db] Mahalliy rejim: ma’lumotlar ${path.resolve(process.env.PGLITE_DIR ?? './data/pglite')} papkasida saqlanadi (faqat shu kompyuter/server diskida).`);

const staticDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../dist');
const app = createApp(db, { appPassword, sessionSecret, staticDir });
const server = app.listen(PORT, () => console.log(`[server] http://localhost:${PORT}`));

const shutdown = async () => { server.close(); await db.close().catch(() => {}); process.exit(0); };
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
