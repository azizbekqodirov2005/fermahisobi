import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

export interface Queryable {
  query<T = any>(sql: string, params?: unknown[]): Promise<T[]>;
}
export interface Db extends Queryable {
  transaction<T>(fn: (tx: Queryable) => Promise<T>): Promise<T>;
  exec(sql: string): Promise<void>;
  /** postgres = Supabase/PostgreSQL (DATABASE_URL), local-file = mahalliy PGlite (diskda saqlanadi), memory = faqat testlar uchun */
  mode: 'postgres' | 'local-file' | 'memory';
  close(): Promise<void>;
}

// numeric -> number, date -> 'YYYY-MM-DD' satri, bigint -> number
const NUMERIC = 1700, DATE = 1082, INT8 = 20;

export async function openPglite(dataDir?: string): Promise<Db> {
  const parsers = {
    [NUMERIC]: (v: string) => parseFloat(v),
    [DATE]: (v: string) => v,
    [INT8]: (v: string) => Number(v),
  };
  if (dataDir) fs.mkdirSync(dataDir, { recursive: true }); // PGlite o'zi ota papkani yaratmaydi
  const { PGlite } = await import('@electric-sql/pglite'); // faqat mahalliy rejimda yuklanadi
  const db = new PGlite({ dataDir, parsers } as any);
  await db.waitReady;
  return {
    mode: dataDir ? 'local-file' : 'memory',
    async query(sql, params) {
      const r = await db.query(sql, params as any[]);
      return r.rows as any[];
    },
    async exec(sql) { await db.exec(sql); },
    async transaction(fn) {
      return db.transaction(async (tx) =>
        fn({ query: async (sql: string, params?: unknown[]) => (await tx.query(sql, params as any[])).rows as any[] }),
      );
    },
    async close() { await db.close(); },
  };
}

export async function openPostgres(connectionString: string): Promise<Db> {
  pg.types.setTypeParser(NUMERIC, (v: string) => parseFloat(v));
  pg.types.setTypeParser(DATE, (v: string) => v);
  pg.types.setTypeParser(INT8, (v: string) => Number(v));
  const isLocal = /@(localhost|127\.0\.0\.1)(:|\/|$)/.test(connectionString);
  const useSsl = !isLocal && process.env.PGSSL !== 'disable';
  const pool = new pg.Pool({ connectionString, max: 8, ssl: useSsl ? { rejectUnauthorized: false } : undefined });
  return {
    mode: 'postgres',
    async query(sql, params) { return (await pool.query(sql, params as any[])).rows; },
    async exec(sql) { await pool.query(sql); },
    async transaction(fn) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const out = await fn({ query: async (sql, params) => (await client.query(sql, params as any[])).rows });
        await client.query('COMMIT');
        return out;
      } catch (e) {
        await client.query('ROLLBACK').catch(() => {});
        throw e;
      } finally {
        client.release();
      }
    },
    async close() { await pool.end(); },
  };
}

/** supabase/migrations/*.sql fayllarini tartib bilan, har birini bir martadan va tranzaksiyada bajaradi. */
export async function migrate(db: Db): Promise<string[]> {
  const dir = fileURLToPath(new URL('../supabase/migrations', import.meta.url));
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
  await db.exec('create table if not exists schema_migrations (name text primary key, applied_at timestamptz not null default now())');
  const done = new Set((await db.query<{ name: string }>('select name from schema_migrations')).map((r) => r.name));
  const applied: string[] = [];
  for (const f of files) {
    if (done.has(f)) continue;
    const sql = fs.readFileSync(path.join(dir, f), 'utf8');
    // Har bir migratsiya yagona tranzaksiyada: yarim yo'lda xato bo'lsa hech narsa qo'llanmaydi.
    await db.exec(`begin;\n${sql}\ninsert into schema_migrations(name) values ('${f.replace(/'/g, "''")}');\ncommit;`).catch(async (e) => {
      await db.exec('rollback').catch(() => {});
      throw e;
    });
    applied.push(f);
  }
  return applied;
}
