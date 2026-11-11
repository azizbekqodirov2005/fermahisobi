import { Router } from 'express';
import type { Db } from '../db';
import { round2 } from '../../shared/calc';
import { expenseSchema, saleSchema } from '../../shared/schemas';
import { HttpError, dateQuery, intParam, pageParams, parse, sortParams, wrap } from '../util';
import { currentPrice } from '../repo';

const SALE_COLS = `id, sale_date as "saleDate", quantity_l as "quantityL", price_per_l as "pricePerL", total_revenue as "totalRevenue", customer_name as "customerName", notes`;
const SALE_SORTS = { date: 'sale_date', quantity: 'quantity_l', revenue: 'total_revenue', customer: 'lower(coalesce(customer_name, \'\'))' };
const EXP_COLS = `id, expense_date as "expenseDate", category, amount, description`;
const EXP_SORTS = { date: 'expense_date', amount: 'amount', category: 'lower(category)' };

export function financeCrudRoutes(db: Db) {
  const r = Router();

  // ------------------------------------------------------------------ sales
  r.get('/sales', wrap(async (req, res) => {
    const from = dateQuery(req.query.from, 'Boshlanish');
    const to = dateQuery(req.query.to, 'Tugash');
    const search = String(req.query.search ?? '').trim();
    const { page, pageSize, offset } = pageParams(req, 20);
    const { expr, dir } = sortParams(req, SALE_SORTS, 'date', 'desc');
    const where: string[] = []; const params: unknown[] = [];
    if (from) { params.push(from); where.push(`sale_date >= $${params.length}`); }
    if (to) { params.push(to); where.push(`sale_date <= $${params.length}`); }
    if (search) { params.push(`%${search}%`); where.push(`customer_name ilike $${params.length}`); }
    const w = where.length ? `where ${where.join(' and ')}` : '';
    const [agg] = await db.query<{ total: number; liters: number; revenue: number }>(
      `select count(*) as total, coalesce(sum(quantity_l),0) as liters, coalesce(sum(total_revenue),0) as revenue from milk_sales ${w}`, params);
    const rows = await db.query(`select ${SALE_COLS} from milk_sales ${w} order by ${expr} ${dir}, id desc limit ${pageSize} offset ${offset}`, params);
    res.json({ rows, total: agg.total, page, pageSize, totalPages: Math.max(1, Math.ceil(agg.total / pageSize)), sumLiters: round2(agg.liters), sumRevenue: round2(agg.revenue) });
  }));

  r.post('/sales', wrap(async (req, res) => {
    const v = parse(saleSchema, req.body);
    const price = v.pricePerL ?? (await currentPrice(db, 'milk', v.saleDate));
    const [row] = await db.query(
      `insert into milk_sales (sale_date, quantity_l, price_per_l, customer_name, notes) values ($1,$2,$3,$4,$5) returning ${SALE_COLS}`,
      [v.saleDate, v.quantityL, price, v.customerName, v.notes]);
    res.status(201).json(row);
  }));

  r.put('/sales/:id', wrap(async (req, res) => {
    const id = intParam(req.params.id);
    const v = parse(saleSchema, req.body);
    const price = v.pricePerL ?? (await currentPrice(db, 'milk', v.saleDate));
    const rows = await db.query(
      `update milk_sales set sale_date=$1, quantity_l=$2, price_per_l=$3, customer_name=$4, notes=$5 where id=$6 returning ${SALE_COLS}`,
      [v.saleDate, v.quantityL, price, v.customerName, v.notes, id]);
    if (!rows.length) throw new HttpError(404, 'Sotuv topilmadi');
    res.json(rows[0]);
  }));

  r.delete('/sales/:id', wrap(async (req, res) => {
    const d = await db.query(`delete from milk_sales where id = $1 returning id`, [intParam(req.params.id)]);
    if (!d.length) throw new HttpError(404, 'Sotuv topilmadi');
    res.json({ ok: true });
  }));

  // --------------------------------------------------------------- expenses
  r.get('/expenses', wrap(async (req, res) => {
    const from = dateQuery(req.query.from, 'Boshlanish');
    const to = dateQuery(req.query.to, 'Tugash');
    const search = String(req.query.search ?? '').trim();
    const { page, pageSize, offset } = pageParams(req, 20);
    const { expr, dir } = sortParams(req, EXP_SORTS, 'date', 'desc');
    const where: string[] = []; const params: unknown[] = [];
    if (from) { params.push(from); where.push(`expense_date >= $${params.length}`); }
    if (to) { params.push(to); where.push(`expense_date <= $${params.length}`); }
    if (search) { params.push(`%${search}%`); where.push(`(category ilike $${params.length} or description ilike $${params.length})`); }
    const w = where.length ? `where ${where.join(' and ')}` : '';
    const [agg] = await db.query<{ total: number; amount: number }>(`select count(*) as total, coalesce(sum(amount),0) as amount from farm_expenses ${w}`, params);
    const rows = await db.query(`select ${EXP_COLS} from farm_expenses ${w} order by ${expr} ${dir}, id desc limit ${pageSize} offset ${offset}`, params);
    res.json({ rows, total: agg.total, page, pageSize, totalPages: Math.max(1, Math.ceil(agg.total / pageSize)), sumAmount: round2(agg.amount) });
  }));

  r.post('/expenses', wrap(async (req, res) => {
    const v = parse(expenseSchema, req.body);
    const [row] = await db.query(
      `insert into farm_expenses (expense_date, category, amount, description) values ($1,$2,$3,$4) returning ${EXP_COLS}`,
      [v.expenseDate, v.category, v.amount, v.description]);
    res.status(201).json(row);
  }));

  r.put('/expenses/:id', wrap(async (req, res) => {
    const id = intParam(req.params.id);
    const v = parse(expenseSchema, req.body);
    const rows = await db.query(
      `update farm_expenses set expense_date=$1, category=$2, amount=$3, description=$4 where id=$5 returning ${EXP_COLS}`,
      [v.expenseDate, v.category, v.amount, v.description, id]);
    if (!rows.length) throw new HttpError(404, 'Xarajat topilmadi');
    res.json(rows[0]);
  }));

  r.delete('/expenses/:id', wrap(async (req, res) => {
    const d = await db.query(`delete from farm_expenses where id = $1 returning id`, [intParam(req.params.id)]);
    if (!d.length) throw new HttpError(404, 'Xarajat topilmadi');
    res.json({ ok: true });
  }));

  return r;
}
