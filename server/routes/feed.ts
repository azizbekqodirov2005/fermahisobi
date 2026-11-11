import { Router } from 'express';
import type { Db } from '../db';
import { round2 } from '../../shared/calc';
import { feedCreateSchema, feedTypeSchema, feedUpdateSchema, rationCreateSchema } from '../../shared/schemas';
import { HttpError, dateQuery, intParam, pageParams, parse, sortParams, wrap } from '../util';
import { currentPrice } from '../repo';

const COLS = `
  f.id, f.animal_id as "animalId", a.name as "animalName", a.tag_number as "animalTag", a.status as "animalStatus",
  f.record_date as "recordDate", f.feed_type as "feedType", f.quantity_kg as "quantityKg",
  f.price_per_kg as "pricePerKg", f.total_cost as "totalCost", f.batch_id as "batchId", f.notes`;
const FROM = `from feed_records f join animals a on a.id = f.animal_id`;
const SORTS = { date: 'f.record_date', quantity: 'f.quantity_kg', cost: 'f.total_cost', animal: 'lower(a.name)' };

export function feedRoutes(db: Db) {
  const r = Router();

  r.get('/feed', wrap(async (req, res) => {
    const from = dateQuery(req.query.from, 'Boshlanish');
    const to = dateQuery(req.query.to, 'Tugash');
    const animalId = req.query.animalId ? intParam(req.query.animalId, 'animalId') : undefined;
    const search = String(req.query.search ?? '').trim();
    const { page, pageSize, offset } = pageParams(req, 20);
    const { expr, dir } = sortParams(req, SORTS, 'date', 'desc');

    const where: string[] = [];
    const params: unknown[] = [];
    if (from) { params.push(from); where.push(`f.record_date >= $${params.length}`); }
    if (to) { params.push(to); where.push(`f.record_date <= $${params.length}`); }
    if (animalId) { params.push(animalId); where.push(`f.animal_id = $${params.length}`); }
    if (search) { params.push(`%${search}%`); where.push(`(a.name ilike $${params.length} or a.tag_number ilike $${params.length} or f.feed_type ilike $${params.length})`); }
    const w = where.length ? `where ${where.join(' and ')}` : '';

    const [agg] = await db.query<{ total: number; kg: number; cost: number }>(
      `select count(*) as total, coalesce(sum(f.quantity_kg),0) as kg, coalesce(sum(f.total_cost),0) as cost ${FROM} ${w}`, params);
    const rows = await db.query(`select ${COLS} ${FROM} ${w} order by ${expr} ${dir}, f.id desc limit ${pageSize} offset ${offset}`, params);
    const perAnimal = await db.query(
      `select f.animal_id as "animalId", a.name as "animalName", a.tag_number as "animalTag", sum(f.quantity_kg) as kg, sum(f.total_cost) as cost
       ${FROM} ${w} group by f.animal_id, a.name, a.tag_number order by kg desc`, params);
    const perType = await db.query<{ feedType: string; kg: number; cost: number; avgPrice: number }>(
      `select coalesce(min(nullif(btrim(f.feed_type), '')), '') as "feedType", sum(f.quantity_kg) as kg, sum(f.total_cost) as cost,
         case when sum(f.quantity_kg) > 0 then round(sum(f.total_cost) / sum(f.quantity_kg), 2) else 0 end as "avgPrice"
       ${FROM} ${w} group by lower(btrim(f.feed_type)) order by cost desc`, params);
    res.json({
      rows, total: agg.total, page, pageSize, totalPages: Math.max(1, Math.ceil(agg.total / pageSize)),
      sumKg: round2(agg.kg), sumCost: round2(agg.cost), perAnimal, perType,
    });
  }));

  // Guruhli kiritish uchun: faol mollar, ularning standart miqdori va shu kuni (shu yem turi bilan) yozuvi bormi
  r.get('/feed/defaults', wrap(async (req, res) => {
    const date = dateQuery(req.query.date, 'Sana');
    if (!date) throw new HttpError(400, 'Sanani kiriting');
    const feedType = String(req.query.feedType ?? '').trim().toLowerCase();
    const rows = await db.query(
      `select a.id as "animalId", a.name as "animalName", a.tag_number as "animalTag", a.daily_feed_kg as "defaultKg",
         exists (select 1 from feed_records f where f.animal_id = a.id and f.record_date = $1 and lower(f.feed_type) = $2) as "alreadyRecorded"
       from animals a where a.status = 'active'
       order by (case when a.tag_number ~ '^[0-9]+$' then lpad(a.tag_number, 20, '0') else a.tag_number end), a.id`, [date, feedType]);
    res.json({ date, price: await currentPrice(db, 'feed', date), rows });
  }));


  // ------------------------------------------------------- yem turlari katalogi
  const TYPE_COLS = `id, name, price_per_kg as "pricePerKg"`;
  r.get('/feed-types', wrap(async (_req, res) => {
    res.json(await db.query(`select ${TYPE_COLS} from feed_types order by lower(name)`));
  }));
  r.post('/feed-types', wrap(async (req, res) => {
    const v = parse(feedTypeSchema, req.body);
    const dup = await db.query(`select 1 from feed_types where lower(btrim(name)) = lower($1)`, [v.name]);
    if (dup.length) throw new HttpError(409, 'Bu nomli yem turi allaqachon bor');
    const [row] = await db.query(`insert into feed_types (name, price_per_kg) values ($1, $2) returning ${TYPE_COLS}`, [v.name, v.pricePerKg]);
    res.status(201).json(row);
  }));
  r.put('/feed-types/:id', wrap(async (req, res) => {
    const id = intParam(req.params.id);
    const v = parse(feedTypeSchema, req.body);
    const dup = await db.query(`select 1 from feed_types where lower(btrim(name)) = lower($1) and id <> $2`, [v.name, id]);
    if (dup.length) throw new HttpError(409, 'Bu nomli yem turi allaqachon bor');
    const u = await db.query(`update feed_types set name = $1, price_per_kg = $2 where id = $3 returning ${TYPE_COLS}`, [v.name, v.pricePerKg, id]);
    if (!u.length) throw new HttpError(404, 'Yem turi topilmadi');
    res.json(u[0]);
  }));
  // Katalogdan o'chirish eski yozuvlarga ta'sir qilmaydi (yozuvlar tur nomi va narxini o'zida saqlaydi).
  r.delete('/feed-types/:id', wrap(async (req, res) => {
    const d = await db.query(`delete from feed_types where id = $1 returning id`, [intParam(req.params.id)]);
    if (!d.length) throw new HttpError(404, 'Yem turi topilmadi');
    res.json({ ok: true });
  }));

  // Bir nechta yem turini (har biri o'z kg va narxi bilan) tanlangan mollarga kiritish
  r.post('/feed/ration', wrap(async (req, res) => {
    const v = parse(rationCreateSchema, req.body);
    const types = v.lines.map((l) => l.feedType.trim());
    const result = await db.transaction(async (tx) => {
      const animals = await tx.query<{ id: number }>(`select id from animals where id = any($1::bigint[])`, [v.animalIds]);
      if (animals.length !== v.animalIds.length) throw new HttpError(404, 'Tanlangan mollardan biri topilmadi');
      const existing = await tx.query<{ animalId: number; name: string; feedType: string }>(
        `select f.animal_id as "animalId", a.name, f.feed_type as "feedType" from feed_records f join animals a on a.id = f.animal_id
         where f.record_date = $1 and f.animal_id = any($2::bigint[]) and lower(f.feed_type) = any($3::text[])`,
        [v.recordDate, v.animalIds, types.map((t) => t.toLowerCase())],
      );
      if (existing.length && !v.skipExisting) {
        const names = [...new Set(existing.map((e) => `${e.name} (${e.feedType})`))].join(', ');
        throw new HttpError(409, `Shu sana va yem turida yozuv allaqachon bor: ${names}. Ularni tahrirlang yoki “mavjudlarini o‘tkazib yuborish”ni tanlang.`);
      }
      const skip = new Set(existing.map((e) => `${e.animalId}|${e.feedType.toLowerCase()}`));
      const [{ id: batchId }] = await tx.query<{ id: string }>('select gen_random_uuid() as id');
      let created = 0;
      for (const animalId of v.animalIds) {
        for (const l of v.lines) {
          const t = l.feedType.trim();
          if (skip.has(`${animalId}|${t.toLowerCase()}`)) continue;
          await tx.query(
            `insert into feed_records (animal_id, record_date, feed_type, quantity_kg, price_per_kg, batch_id, notes) values ($1,$2,$3,$4,$5,$6,$7)`,
            [animalId, v.recordDate, t, l.quantityKg, l.pricePerKg, v.animalIds.length * v.lines.length > 1 ? batchId : null, v.notes],
          );
          created += 1;
        }
      }
      return { created, skipped: existing.length };
    });
    res.status(201).json(result);
  }));

  const getOne = async (id: number) => (await db.query(`select ${COLS} ${FROM} where f.id = $1`, [id]))[0];

  // Individual va guruhli kiritish — bitta endpoint: har bir mol uchun alohida qator (yagona (mol, kun, tur) cheklovi bilan).
  r.post('/feed', wrap(async (req, res) => {
    const v = parse(feedCreateSchema, req.body);
    const feedType = v.feedType.trim();
    const price = v.pricePerKg ?? (await currentPrice(db, 'feed', v.recordDate));

    const result = await db.transaction(async (tx) => {
      const ids = v.items.map((i) => i.animalId);
      const existing = await tx.query<{ animalId: number; name: string }>(
        `select f.animal_id as "animalId", a.name from feed_records f join animals a on a.id = f.animal_id
         where f.record_date = $1 and lower(f.feed_type) = lower($2) and f.animal_id = any($3::bigint[])`,
        [v.recordDate, feedType, ids],
      );
      if (existing.length && !v.skipExisting) {
        throw new HttpError(409, `Quyidagi mollar uchun shu sana va yem turida yozuv allaqachon bor: ${existing.map((e) => e.name).join(', ')}. Ularni tahrirlang yoki “mavjudlarini o‘tkazib yuborish”ni tanlang.`);
      }
      const skip = new Set(existing.map((e) => e.animalId));
      const [{ id: batchId }] = await tx.query<{ id: string }>('select gen_random_uuid() as id');
      let created = 0;
      for (const it of v.items) {
        if (skip.has(it.animalId)) continue;
        await tx.query(
          `insert into feed_records (animal_id, record_date, feed_type, quantity_kg, price_per_kg, batch_id, notes) values ($1,$2,$3,$4,$5,$6,$7)`,
          [it.animalId, v.recordDate, feedType, it.quantityKg, price, v.items.length > 1 ? batchId : null, v.notes],
        );
        created += 1;
      }
      return { created, skipped: existing.map((e) => e.name) };
    });
    res.status(201).json(result);
  }));

  r.put('/feed/:id', wrap(async (req, res) => {
    const id = intParam(req.params.id);
    const v = parse(feedUpdateSchema, req.body);
    const u = await db.query(
      `update feed_records set record_date=$1, feed_type=$2, quantity_kg=$3, price_per_kg=$4, notes=$5 where id=$6 returning id`,
      [v.recordDate, v.feedType.trim(), v.quantityKg, v.pricePerKg, v.notes, id],
    );
    if (!u.length) throw new HttpError(404, 'Yozuv topilmadi');
    res.json(await getOne(id));
  }));

  r.delete('/feed/:id', wrap(async (req, res) => {
    const d = await db.query(`delete from feed_records where id = $1 returning id`, [intParam(req.params.id)]);
    if (!d.length) throw new HttpError(404, 'Yozuv topilmadi');
    res.json({ ok: true });
  }));

  return r;
}
