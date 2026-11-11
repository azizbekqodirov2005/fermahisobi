import type { Queryable } from './db';
import { computeAge } from '../shared/calc';
import type { Animal } from '../shared/types';
import type { ExpenseRow, FeedRow, MilkRow, SaleRow } from '../shared/calc';
import type { PriceRow } from '../shared/types';
import { priceOn } from '../shared/calc';

export const ANIMAL_COLS = `
  a.id, a.tag_number as "tagNumber", a.name, a.birth_date as "birthDate",
  a.age_years as "ageYears", a.age_months as "ageMonths", a.age_recorded_on as "ageRecordedOn",
  a.daily_feed_kg as "dailyFeedKg", a.notes, a.status, a.date_added as "dateAdded",
  a.created_at as "createdAt", a.updated_at as "updatedAt",
  (exists (select 1 from milk_records m where m.animal_id = a.id)
   or exists (select 1 from feed_records f where f.animal_id = a.id)) as "hasHistory"`;

export function mapAnimal(row: any, today: string): Animal {
  return {
    ...row,
    createdAt: new Date(row.createdAt).toISOString(),
    updatedAt: new Date(row.updatedAt).toISOString(),
    age: computeAge(row, today),
  };
}

export async function getSettingsRow(q: Queryable) {
  const [s] = await q.query<{ farmName: string; currencyLabel: "so'm" | 'UZS'; timezone: string }>(
    `select farm_name as "farmName", currency_label as "currencyLabel", timezone from farm_settings where id = 1`,
  );
  return s;
}

export async function getPriceHistory(q: Queryable): Promise<PriceRow[]> {
  return q.query<PriceRow>(
    `select id, kind, price, effective_from as "effectiveFrom" from price_history order by effective_from desc, id desc`,
  );
}

export async function currentPrice(q: Queryable, kind: 'milk' | 'feed', date: string): Promise<number> {
  return priceOn(await getPriceHistory(q), kind, date);
}

export async function milkRows(q: Queryable, from: string, to: string): Promise<MilkRow[]> {
  return q.query<MilkRow>(
    `select animal_id as "animalId", record_date as date, total_l as liters from milk_records where record_date between $1 and $2`,
    [from, to],
  );
}
export async function feedRows(q: Queryable, from: string, to: string): Promise<FeedRow[]> {
  return q.query<FeedRow>(
    `select animal_id as "animalId", record_date as date, quantity_kg as kg, total_cost as cost from feed_records where record_date between $1 and $2`,
    [from, to],
  );
}
export async function saleRows(q: Queryable, from: string, to: string): Promise<SaleRow[]> {
  return q.query<SaleRow>(
    `select sale_date as date, quantity_l as liters, total_revenue as revenue from milk_sales where sale_date between $1 and $2`,
    [from, to],
  );
}
export async function expenseRows(q: Queryable, from: string, to: string): Promise<(ExpenseRow & { category: string })[]> {
  return q.query(`select expense_date as date, amount, category from farm_expenses where expense_date between $1 and $2`, [from, to]);
}

export const inRange = <T extends { date: string }>(rows: T[], from: string, to: string) => rows.filter((r) => r.date >= from && r.date <= to);
