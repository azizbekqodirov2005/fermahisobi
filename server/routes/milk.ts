import { Router } from 'express';
import type { Db } from '../db';
import { round2 } from '../../shared/calc';
import { milkBulkSchema, milkSchema } from '../../shared/schemas';
import { HttpError, dateQuery, intParam, pageParams, parse, sortParams, wrap } from '../util';

const COLS = `
  m.id, m.animal_id as "animalId", a.name as "animalName", a.tag_number as "animalTag", a.status as "animalStatus",
  m.record_date as "recordDate", m.morning_l as "morningL", m.evening_l as "eveningL", m.extra_l as "extraL",
  m.total_l as "totalL", m.notes`;
const FROM = `from milk_records m join animals a on a.id = m.animal_id`;
const SORTS = { date: 'm.record_date', total: 'm.total_l', animal: 'lower(a.name)', morning: 'm.morning_l', evening: 'm.evening_l' };

export function milkRoutes(db: Db) {
  const r = Router();

  r.get('/milk', wrap(async (req, res) => {
    const from = dateQuery(req.query.from, 'Boshlanish');
    const to = dateQuery(req.query.to, 'Tugash');
    const animalId = req.query.animalId ? intParam(req.query.animalId, 'animalId') : undefined;
    const search = String(req.query.search ?? '').trim();
    const { page, pageSize, offset } = pageParams(req, 20);
    const { expr, dir } = sortParams(req, SORTS, 'date', 'desc');

    const where: string[] = [];
    const params: unknown[] = [];
    if (from) { params.push(from); where.push(`m.record_date >= $${params.length}`); }
    if (to) { params.push(to); where.push(`m.record_date <= $${params.length}`); }
    if (animalId) { params.push(animalId); where.push(`m.animal_id = $${params.length}`); }
    if (search) { params.push(`%${search}%`); where.push(`(a.name ilike $${params.length} or a.tag_number ilike $${params.length})`); }
    const w = where.length ? `where ${where.join(' and ')}` : '';

    const [agg] = await db.query<{ total: number; liters: number }>(`select count(*) as total, coalesce(sum(m.total_l),0) as liters ${FROM} ${w}`, params);
    const rows = await db.query(`select ${COLS} ${FROM} ${w} order by ${expr} ${dir}, m.id desc limit ${pageSize} offset ${offset}`, params);
    // Har bir mol bo'yicha jami (filtr ichida) — ikki marta sanalmaydi: har (mol, kun) uchun yagona qator.
    const perAnimal = await db.query(
      `select m.animal_id as "animalId", a.name as "animalName", a.tag_number as "animalTag", sum(m.total_l) as liters, count(*) as days
       ${FROM} ${w} group by m.animal_id, a.name, a.tag_number order by liters desc`, params);
    res.json({
      rows, total: agg.total, page, pageSize, totalPages: Math.max(1, Math.ceil(agg.total / pageSize)),
      sumLiters: round2(agg.liters), perAnimal,
    });
  }));

  // Kunlik jadval: faol mollar (+ shu kuni yozuvi bor nofaol mollar) va ularning mavjud yozuvi
  r.get('/milk/day', wrap(async (req, res) => {
    const date = dateQuery(req.query.date, 'Sana');
    if (!date) throw new HttpError(400, 'Sanani kiriting');
    const rows = await db.query(
      `select a.id as "animalId", a.name as "animalName", a.tag_number as "animalTag", a.status as "animalStatus",
         m.id as "recordId", m.morning_l as "morningL", m.evening_l as "eveningL", m.extra_l as "extraL", m.total_l as "totalL"
       from animals a left join milk_records m on m.animal_id = a.id and m.record_date = $1
       where a.status = 'active' or m.id is not null
       order by (case when a.tag_number ~ '^[0-9]+$' then lpad(a.tag_number, 20, '0') else a.tag_number end), a.id`, [date]);
    res.json({ date, rows });
  }));

  const getOne = async (id: number) => (await db.query(`select ${COLS} ${FROM} where m.id = $1`, [id]))[0];

  r.post('/milk', wrap(async (req, res) => {
    const v = parse(milkSchema, req.body);
    const [c] = await db.query<{ id: number }>(
      `insert into milk_records (animal_id, record_date, morning_l, evening_l, extra_l, notes) values ($1,$2,$3,$4,$5,$6) returning id`,
      [v.animalId, v.recordDate, v.morningL, v.eveningL, v.extraL, v.notes],
    );
    res.status(201).json(await getOne(c.id));
  }));

  r.put('/milk/:id', wrap(async (req, res) => {
    const id = intParam(req.params.id);
    const v = parse(milkSchema, req.body);
    const u = await db.query(
      `update milk_records set animal_id=$1, record_date=$2, morning_l=$3, evening_l=$4, extra_l=$5, notes=$6 where id=$7 returning id`,
      [v.animalId, v.recordDate, v.morningL, v.eveningL, v.extraL, v.notes, id],
    );
    if (!u.length) throw new HttpError(404, 'Yozuv topilmadi');
    res.json(await getOne(id));
  }));

  r.delete('/milk/:id', wrap(async (req, res) => {
    const d = await db.query(`delete from milk_records where id = $1 returning id`, [intParam(req.params.id)]);
    if (!d.length) throw new HttpError(404, 'Yozuv topilmadi');
    res.json({ ok: true });
  }));

  // Kunlik jadvalni birdaniga saqlash: bir tranzaksiya, mavjud yozuvlar yangilanadi (takror yaratilmaydi).
  r.post('/milk/bulk', wrap(async (req, res) => {
    const v = parse(milkBulkSchema, req.body);
    const ids = v.rows.map((x) => x.animalId);
    if (new Set(ids).size !== ids.length) throw new HttpError(400, 'Bitta mol ro‘yxatda ikki marta uchraydi');
    await db.transaction(async (tx) => {
      for (const row of v.rows) {
        await tx.query(
          `insert into milk_records (animal_id, record_date, morning_l, evening_l, extra_l) values ($1,$2,$3,$4,$5)
           on conflict (animal_id, record_date) do update set morning_l = excluded.morning_l, evening_l = excluded.evening_l, extra_l = excluded.extra_l`,
          [row.animalId, v.recordDate, row.morningL, row.eveningL, row.extraL],
        );
      }
    });
    res.json({ saved: v.rows.length });
  }));

  return r;
}
