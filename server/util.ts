import type { NextFunction, Request, Response } from 'express';
import { z } from 'zod';
import { isValidYmd } from '../shared/dates';

export class HttpError extends Error {
  constructor(public status: number, message: string, public fields?: Record<string, string>) {
    super(message);
  }
}

export const wrap =
  (fn: (req: Request, res: Response) => Promise<unknown>) =>
  (req: Request, res: Response, next: NextFunction) => {
    fn(req, res).catch(next);
  };

export function parse<S extends z.ZodTypeAny>(schema: S, data: unknown): z.output<S> {
  const r = schema.safeParse(data);
  if (r.success) return r.data;
  const fields: Record<string, string> = {};
  for (const issue of r.error.issues) {
    const key = issue.path.join('.') || '_';
    if (!fields[key]) fields[key] = issue.message;
  }
  const first = r.error.issues[0];
  const where = first.path.length ? ` (${first.path.join('.')})` : '';
  throw new HttpError(400, `${first.message}${where}`, fields);
}

export function intParam(v: unknown, name = 'id'): number {
  const n = Number(v);
  if (!Number.isInteger(n) || n <= 0) throw new HttpError(400, `${name} noto‘g‘ri`);
  return n;
}

export function dateQuery(v: unknown, name: string): string | undefined {
  if (v === undefined || v === '') return undefined;
  if (!isValidYmd(v)) throw new HttpError(400, `${name} sanasi noto‘g‘ri (YYYY-MM-DD)`);
  return v;
}

export function rangeQuery(req: Request, defaults: { from: string; to: string }, maxDays = 3700) {
  const from = dateQuery(req.query.from, 'Boshlanish') ?? defaults.from;
  const to = dateQuery(req.query.to, 'Tugash') ?? defaults.to;
  if (from > to) throw new HttpError(400, 'Boshlanish sanasi tugash sanasidan keyin bo‘lishi mumkin emas');
  const days = (Date.parse(to) - Date.parse(from)) / 86400000;
  if (days > maxDays) throw new HttpError(400, 'Sana oralig‘i juda katta');
  return { from, to };
}

export function pageParams(req: Request, defaultSize = 20) {
  const raw = String(req.query.pageSize ?? defaultSize);
  const all = raw === 'all';
  const pageSize = all ? 100000 : Math.min(Math.max(parseInt(raw, 10) || defaultSize, 1), 200);
  const page = Math.max(parseInt(String(req.query.page ?? '1'), 10) || 1, 1);
  return { page, pageSize, offset: (page - 1) * pageSize };
}

export function sortParams(req: Request, map: Record<string, string>, fallback: string, fallbackDir: 'asc' | 'desc' = 'desc') {
  const key = String(req.query.sort ?? fallback);
  const expr = map[key] ?? map[fallback];
  const dir = (String(req.query.dir ?? fallbackDir).toLowerCase() === 'asc' ? 'asc' : 'desc') as 'asc' | 'desc';
  return { expr, dir };
}

const PG_MESSAGES: Record<string, { status: number; message: string; field?: string }> = {
  animals_tag_unique: { status: 409, message: 'Bu raqamli mol allaqachon mavjud. Boshqa raqam kiriting.', field: 'tagNumber' },
  milk_records_one_per_day: { status: 409, message: 'Bu mol uchun shu sanada sut yozuvi allaqachon mavjud. Mavjud yozuvni tahrirlang.', field: 'animalId' },
  feed_records_unique_per_day: { status: 409, message: 'Bu mol uchun shu sanada shu turdagi yemish yozuvi allaqachon mavjud. Mavjud yozuvni tahrirlang.', field: 'animalId' },
};

export function errorHandler(err: any, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof HttpError) {
    res.status(err.status).json({ error: err.message, fields: err.fields });
    return;
  }
  if (err?.type === 'entity.parse.failed') {
    res.status(400).json({ error: 'So‘rov formati noto‘g‘ri (JSON)' });
    return;
  }
  const code = err?.code as string | undefined;
  if (code === '23505') {
    const m = PG_MESSAGES[err.constraint as string];
    res.status(m?.status ?? 409).json({ error: m?.message ?? 'Bunday yozuv allaqachon mavjud.', fields: m?.field ? { [m.field]: m.message } : undefined });
    return;
  }
  if (code === '23503') {
    res.status(409).json({ error: 'Bog‘langan yozuvlar mavjud — o‘chirib bo‘lmaydi yoki mol topilmadi.' });
    return;
  }
  if (code === '23514' || code === '22003' || code === '22P02') {
    res.status(400).json({ error: 'Kiritilgan qiymatlar ruxsat etilgan oraliqdan tashqarida yoki noto‘g‘ri.' });
    return;
  }
  console.error('[server error]', err);
  res.status(500).json({ error: 'Serverda kutilmagan xatolik yuz berdi. Keyinroq qayta urinib ko‘ring.' });
}
