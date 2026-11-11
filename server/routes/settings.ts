import { Router } from 'express';
import type { Db } from '../db';
import { priceOn } from '../../shared/calc';
import { todayIn } from '../../shared/dates';
import { priceSchema, settingsSchema } from '../../shared/schemas';
import type { Settings } from '../../shared/types';
import { getPriceHistory, getSettingsRow } from '../repo';
import { HttpError, dateQuery, intParam, parse, wrap } from '../util';

export async function buildSettings(db: Db): Promise<Settings> {
  const s = await getSettingsRow(db);
  const history = await getPriceHistory(db);
  const today = todayIn(s.timezone);
  return {
    ...s,
    today,
    milkPrice: priceOn(history, 'milk', today),
    feedPrice: priceOn(history, 'feed', today),
    priceHistory: history,
  };
}

export function settingsRoutes(db: Db) {
  const r = Router();

  r.get('/settings', wrap(async (_req, res) => { res.json(await buildSettings(db)); }));

  // Berilgan sanada amaldagi narx (sotuv/yemish formasi uchun)
  r.get('/prices/on', wrap(async (req, res) => {
    const kind = req.query.kind === 'feed' ? 'feed' : 'milk';
    const date = dateQuery(req.query.date, 'Sana');
    if (!date) throw new HttpError(400, 'Sanani kiriting');
    res.json({ price: priceOn(await getPriceHistory(db), kind, date) });
  }));

  r.put('/settings', wrap(async (req, res) => {
    const v = parse(settingsSchema, req.body);
    await db.query(`update farm_settings set farm_name = $1, currency_label = $2 where id = 1`, [v.farmName, v.currencyLabel]);
    res.json(await buildSettings(db));
  }));

  // Narxni o'zgartirish tarixga yangi qator qo'shadi — eski yozuvlar (sotuv, yemish) o'z narxini saqlab qoladi.
  r.post('/prices', wrap(async (req, res) => {
    const v = parse(priceSchema, req.body);
    await db.query(
      `insert into price_history (kind, price, effective_from) values ($1, $2, $3)
       on conflict (kind, effective_from) do update set price = excluded.price`,
      [v.kind, v.price, v.effectiveFrom],
    );
    res.status(201).json(await buildSettings(db));
  }));

  r.delete('/prices/:id', wrap(async (req, res) => {
    const id = intParam(req.params.id);
    const [row] = await db.query<{ effectiveFrom: string }>(`select effective_from as "effectiveFrom" from price_history where id = $1`, [id]);
    if (!row) throw new HttpError(404, 'Narx topilmadi');
    if (row.effectiveFrom === '2000-01-01') throw new HttpError(409, 'Boshlang‘ich narx qatorini o‘chirib bo‘lmaydi');
    await db.query(`delete from price_history where id = $1`, [id]);
    res.json(await buildSettings(db));
  }));

  return r;
}
