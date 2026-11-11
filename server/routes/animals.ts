import { Router } from 'express';
import type { Db } from '../db';
import { round2, sum } from '../../shared/calc';
import { addDays, todayIn } from '../../shared/dates';
import { animalSchema } from '../../shared/schemas';
import { ANIMAL_COLS, getSettingsRow, mapAnimal } from '../repo';
import { HttpError, intParam, pageParams, parse, sortParams, wrap } from '../util';

const AGE_EXPR = `coalesce(a.birth_date, (a.age_recorded_on - ((coalesce(a.age_years,0) * 12 + coalesce(a.age_months,0)) * interval '1 month'))::date)`;
const SORTS: Record<string, string> = {
  name: 'lower(a.name)',
  tag: `(case when a.tag_number ~ '^[0-9]+$' then lpad(a.tag_number, 20, '0') else a.tag_number end)`,
  feed: 'a.daily_feed_kg',
  added: 'a.date_added',
  // "yosh" bo'yicha o'sish tartibi = yoshi kichiklari birinchi (tug'ilgan sana kamayish tartibida)
  age: AGE_EXPR,
};

export function animalRoutes(db: Db) {
  const r = Router();
  const today = async () => todayIn((await getSettingsRow(db)).timezone);

  r.get('/animals', wrap(async (req, res) => {
    const t = await today();
    const search = String(req.query.search ?? '').trim();
    const status = String(req.query.status ?? 'all');
    const { page, pageSize, offset } = pageParams(req, 20);
    let { expr, dir } = sortParams(req, SORTS, 'tag', 'asc');
    if (expr === AGE_EXPR) dir = dir === 'asc' ? 'desc' : 'asc';

    const where: string[] = [];
    const params: unknown[] = [];
    if (search) { params.push(`%${search}%`); where.push(`(a.name ilike $${params.length} or a.tag_number ilike $${params.length})`); }
    if (status === 'active' || status === 'inactive') { params.push(status); where.push(`a.status = $${params.length}`); }
    const w = where.length ? `where ${where.join(' and ')}` : '';

    const [{ total }] = await db.query<{ total: number }>(`select count(*) as total from animals a ${w}`, params);
    const rows = await db.query(
      `select ${ANIMAL_COLS} from animals a ${w} order by ${expr} ${dir}, a.id asc limit ${pageSize} offset ${offset}`,
      params,
    );
    const [counts] = await db.query<{ active: number; inactive: number }>(
      `select count(*) filter (where status = 'active') as active, count(*) filter (where status = 'inactive') as inactive from animals`,
    );
    res.json({
      rows: rows.map((a) => mapAnimal(a, t)),
      total, page, pageSize, totalPages: Math.max(1, Math.ceil(total / pageSize)),
      activeCount: counts.active, inactiveCount: counts.inactive,
    });
  }));

  r.get('/animals/:id', wrap(async (req, res) => {
    const id = intParam(req.params.id);
    const t = await today();
    const [row] = await db.query(`select ${ANIMAL_COLS} from animals a where a.id = $1`, [id]);
    if (!row) throw new HttpError(404, 'Mol topilmadi');
    const from30 = addDays(t, -29);

    const [milkAll] = await db.query<{ liters: number; days: number }>(
      `select coalesce(sum(total_l),0) as liters, count(*) as days from milk_records where animal_id = $1`, [id]);
    const [feedAll] = await db.query<{ kg: number; cost: number }>(
      `select coalesce(sum(quantity_kg),0) as kg, coalesce(sum(total_cost),0) as cost from feed_records where animal_id = $1`, [id]);
    const daily = await db.query<{ date: string; liters: number }>(
      `select record_date as date, total_l as liters from milk_records where animal_id = $1 and record_date between $2 and $3 order by record_date`,
      [id, from30, t]);
    const recentMilk = await db.query(
      `select id, record_date as "recordDate", morning_l as "morningL", evening_l as "eveningL", extra_l as "extraL", total_l as "totalL", notes
       from milk_records where animal_id = $1 order by record_date desc limit 10`, [id]);
    const recentFeed = await db.query(
      `select id, record_date as "recordDate", feed_type as "feedType", quantity_kg as "quantityKg", price_per_kg as "pricePerKg", total_cost as "totalCost"
       from feed_records where animal_id = $1 order by record_date desc, id desc limit 10`, [id]);

    const last30 = sum(daily.map((d) => d.liters));
    res.json({
      animal: mapAnimal(row, t),
      stats: {
        milkTotalL: round2(milkAll.liters),
        milkDays: milkAll.days,
        milkAvgPerDay: milkAll.days ? round2(milkAll.liters / milkAll.days) : 0,
        milkLast30L: last30,
        feedTotalKg: round2(feedAll.kg),
        feedTotalCost: round2(feedAll.cost),
      },
      dailyLast30: daily,
      recentMilk,
      recentFeed,
    });
  }));

  const toDb = (v: ReturnType<typeof animalSchema.parse>, t: string) => {
    const manual = !v.birthDate;
    return [
      v.tagNumber, v.name, v.birthDate,
      manual ? v.ageYears ?? 0 : null,
      manual ? v.ageMonths ?? 0 : null,
      manual ? t : null,
      v.dailyFeedKg, v.notes, v.status,
    ];
  };

  r.post('/animals', wrap(async (req, res) => {
    const v = parse(animalSchema, req.body);
    const t = await today();
    const [created] = await db.query<{ id: number }>(
      `insert into animals (tag_number, name, birth_date, age_years, age_months, age_recorded_on, daily_feed_kg, notes, status, date_added)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) returning id`,
      [...toDb(v, t), v.dateAdded ?? t],
    );
    const [row] = await db.query(`select ${ANIMAL_COLS} from animals a where a.id = $1`, [created.id]);
    res.status(201).json(mapAnimal(row, t));
  }));

  r.put('/animals/:id', wrap(async (req, res) => {
    const id = intParam(req.params.id);
    const v = parse(animalSchema, req.body);
    const t = await today();
    // daily_feed_kg faqat "standart" miqdor: eski yemish yozuvlari (feed_records) o'zgarmaydi.
    const updated = await db.query(
      `update animals set tag_number=$1, name=$2, birth_date=$3, age_years=$4, age_months=$5, age_recorded_on=$6,
         daily_feed_kg=$7, notes=$8, status=$9, date_added=coalesce($10, date_added) where id=$11 returning id`,
      [...toDb(v, t), v.dateAdded, id],
    );
    if (!updated.length) throw new HttpError(404, 'Mol topilmadi');
    const [row] = await db.query(`select ${ANIMAL_COLS} from animals a where a.id = $1`, [id]);
    res.json(mapAnimal(row, t));
  }));

  r.patch('/animals/:id/status', wrap(async (req, res) => {
    const id = intParam(req.params.id);
    const status = req.body?.status;
    if (status !== 'active' && status !== 'inactive') throw new HttpError(400, 'Holat noto‘g‘ri');
    const u = await db.query(`update animals set status = $1 where id = $2 returning id`, [status, id]);
    if (!u.length) throw new HttpError(404, 'Mol topilmadi');
    const [row] = await db.query(`select ${ANIMAL_COLS} from animals a where a.id = $1`, [id]);
    res.json(mapAnimal(row, await today()));
  }));

  // Tarix (sut/yemish) bor mol o'chirilmaydi — faqat nofaol qilinadi. Tarixi yo'q mol o'chiriladi.
  r.delete('/animals/:id', wrap(async (req, res) => {
    const id = intParam(req.params.id);
    const [row] = await db.query<{ hasHistory: boolean }>(`select ${ANIMAL_COLS} from animals a where a.id = $1`, [id]);
    if (!row) throw new HttpError(404, 'Mol topilmadi');
    if (row.hasHistory) {
      throw new HttpError(409, 'Bu molning sut yoki yemish yozuvlari bor. Tarix saqlanishi uchun uni o‘chirib bo‘lmaydi — o‘rniga “Nofaol” holatga o‘tkazing.');
    }
    await db.query(`delete from animals where id = $1`, [id]);
    res.json({ ok: true });
  }));

  return r;
}
