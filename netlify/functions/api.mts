import type { Config } from '@netlify/functions';
import serverless from 'serverless-http';
import { createApp } from '../../server/app';
import { openPostgres } from '../../server/db';
import { FEED_TYPES_SQL } from '../../server/schema-embedded';

// Baza: Supabase (PostgreSQL). Sxema supabase/migrations/0001_init.sql orqali Supabase SQL Editor'da bir marta yaratiladi.
const databaseUrl = Netlify.env.get('DATABASE_URL');
const appPassword = Netlify.env.get('APP_PASSWORD');
const sessionSecret = Netlify.env.get('SESSION_SECRET');

let handler: ReturnType<typeof serverless> | undefined;

async function getHandler() {
  if (!appPassword || !sessionSecret || !databaseUrl) {
    throw new Error('APP_PASSWORD, SESSION_SECRET va DATABASE_URL o‘rnatilishi shart');
  }
  if (!handler) {
    const db = await openPostgres(databaseUrl);
    await db.exec(FEED_TYPES_SQL); // yem turlari jadvali (idempotent); 0001 sxemasi Supabase'da allaqachon yaratilgan
    handler = serverless(createApp(db, { appPassword, sessionSecret }));
  }
  return handler;
}

export default async (req: Request): Promise<Response> => {
  try {
    const h = await getHandler();
    const url = new URL(req.url);
    const body = ['GET', 'HEAD'].includes(req.method) ? undefined : Buffer.from(await req.arrayBuffer());
    const headers: Record<string, string> = {};
    req.headers.forEach((v, k) => { headers[k] = v; });
    const qs: Record<string, string[]> = {};
    url.searchParams.forEach((v, k) => { (qs[k] ??= []).push(v); });
    const result: any = await (h as any)({
      httpMethod: req.method,
      path: url.pathname,
      headers,
      multiValueHeaders: {},
      queryStringParameters: Object.fromEntries(Object.entries(qs).map(([k, v]) => [k, v[v.length - 1]])),
      multiValueQueryStringParameters: qs,
      body: body ? body.toString('base64') : null,
      isBase64Encoded: !!body,
      requestContext: {},
    }, {});
    const out = new Headers();
    for (const [k, v] of Object.entries(result.headers ?? {})) out.set(k, String(v));
    for (const [k, vs] of Object.entries(result.multiValueHeaders ?? {})) for (const v of vs as string[]) out.append(k, v);
    const payload = result.isBase64Encoded ? Buffer.from(result.body ?? '', 'base64') : (result.body ?? '');
    return new Response(result.statusCode === 204 ? null : payload, { status: result.statusCode, headers: out });
  } catch (e) {
    console.error('[api]', e);
    const missing = ['APP_PASSWORD', 'SESSION_SECRET', 'DATABASE_URL'].filter((k) => !Netlify.env.get(k));
    return Response.json({
      error: 'Server sozlanmagan yoki xatolik yuz berdi',
      missingEnv: missing,
      detail: e instanceof Error ? `${e.name}: ${e.message}` : String(e),
    }, { status: 500 });
  }
};

export const config: Config = { path: '/api/*' };
