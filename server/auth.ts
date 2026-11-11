import crypto from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { HttpError } from './util';

const TTL_MS = 1000 * 60 * 60 * 24 * 30; // 30 kun

const b64 = (b: Buffer | string) => Buffer.from(b).toString('base64url');
const sha = (s: string) => crypto.createHash('sha256').update(s).digest();

export function makeAuth(opts: { password?: string; secret: string }) {
  const enabled = Boolean(opts.password);
  const sign = (payload: string) => crypto.createHmac('sha256', opts.secret).update(payload).digest('base64url');

  const issue = () => {
    const payload = b64(JSON.stringify({ exp: Date.now() + TTL_MS }));
    return `${payload}.${sign(payload)}`;
  };

  const verify = (token: string | undefined): boolean => {
    if (!token) return false;
    const [payload, sig] = token.split('.');
    if (!payload || !sig) return false;
    const expected = sign(payload);
    if (sig.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return false;
    try {
      return JSON.parse(Buffer.from(payload, 'base64url').toString()).exp > Date.now();
    } catch {
      return false;
    }
  };

  // Brute-force'dan himoya: noto'g'ri urinishlardan keyin kechiktirish
  let failures = 0;
  let lockedUntil = 0;

  return {
    enabled,
    login(password: unknown): string {
      if (!enabled) return issue();
      if (Date.now() < lockedUntil) throw new HttpError(429, 'Juda ko‘p noto‘g‘ri urinish. Biroz kutib, qayta urinib ko‘ring.');
      const ok = typeof password === 'string' && crypto.timingSafeEqual(sha(password), sha(opts.password!));
      if (!ok) {
        failures += 1;
        if (failures >= 5) { lockedUntil = Date.now() + 30_000; failures = 0; }
        throw new HttpError(401, 'Parol noto‘g‘ri');
      }
      failures = 0;
      return issue();
    },
    middleware(req: Request, _res: Response, next: NextFunction) {
      if (!enabled) return next();
      const h = req.headers.authorization ?? '';
      const token = h.startsWith('Bearer ') ? h.slice(7) : undefined;
      if (!verify(token)) return next(new HttpError(401, 'Kirish talab qilinadi'));
      next();
    },
  };
}
