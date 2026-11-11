import { Router } from 'express';
import type { Db } from '../db';
import {
  compareAnimals, computeFinance, dailySeries, decreasedAnimals, estimateRevenue, monthRangesEndingAt,
  perAnimalFinance, previousPeriod, round2, sum, weekRangesEndingAt,
} from '../../shared/calc';
import { addDays, diffDays, eachDay, monthEnd, monthRange, monthStart, todayIn, weekRange } from '../../shared/dates';
import { expenseRows, feedRows, getPriceHistory, getSettingsRow, inRange, milkRows, saleRows } from '../repo';
import { rangeQuery, wrap } from '../util';

const min = (a: string, b: string) => (a < b ? a : b);
const max = (a: string, b: string) => (a > b ? a : b);

async function loadAnimals(db: Db) {
  const rows = await db.query<{ id: number; name: string; tag: string; status: 'active' | 'inactive' }>(
    `select id, name, tag_number as tag, status from animals order by (case when tag_number ~ '^[0-9]+$' then lpad(tag_number, 20, '0') else tag_number end), id`,
  );
  return rows;
}

export function reportRoutes(db: Db) {
  const r = Router();

  // ------------------------------------------------------------- dashboard
  r.get('/dashboard', wrap(async (req, res) => {
    const s = await getSettingsRow(db);
    const today = todayIn(s.timezone);
    const wk = weekRange(today), mo = monthRange(today);
    const range = rangeQuery(req, { from: mo.from, to: today });
    const lo = [range.from, wk.from, mo.from].reduce(min), hi = [range.to, wk.to, mo.to, today].reduce(max);

    const [animals, milk, feed, sales, history] = await Promise.all([
      loadAnimals(db), milkRows(db, lo, hi), feedRows(db, lo, hi), saleRows(db, lo, hi), getPriceHistory(db),
    ]);
    const byId = new Map(animals.map((a) => [a.id, a]));

    const milkToday = sum(inRange(milk, today, today).map((m) => m.liters));
    const feedToday = inRange(feed, today, today);
    const salesToday = inRange(sales, today, today);
    const feedCostToday = sum(feedToday.map((f) => f.cost));
    const actualToday = sum(salesToday.map((x) => x.revenue));
    const estimatedToday = estimateRevenue(inRange(milk, today, today), history);
    const revenueKind = salesToday.length > 0 ? 'actual' : 'estimated';
    const revenueToday = revenueKind === 'actual' ? actualToday : estimatedToday;

    const rangeMilk = inRange(milk, range.from, range.to);
    const fin = computeFinance({ milk: rangeMilk, feed: inRange(feed, range.from, range.to), sales: inRange(sales, range.from, range.to), expenses: [], history });
    const perAnimal = animals
      .map((a) => ({ animalId: a.id, name: a.name, tag: a.tag, liters: sum(rangeMilk.filter((m) => m.animalId === a.id).map((m) => m.liters)) }))
      .filter((a) => a.liters > 0)
      .sort((a, b) => b.liters - a.liters);

    const recentMilk = await db.query(
      `select m.id, a.name as "animalName", a.tag_number as "animalTag", m.record_date as "recordDate", m.morning_l as "morningL", m.evening_l as "eveningL", m.extra_l as "extraL", m.total_l as "totalL"
       from milk_records m join animals a on a.id = m.animal_id order by m.record_date desc, m.id desc limit 8`);
    const recentFeed = await db.query(
      `select f.id, a.name as "animalName", a.tag_number as "animalTag", f.record_date as "recordDate", f.feed_type as "feedType", f.quantity_kg as "quantityKg", f.total_cost as "totalCost"
       from feed_records f join animals a on a.id = f.animal_id order by f.record_date desc, f.id desc limit 8`);

    res.json({
      today,
      week: wk,
      month: mo,
      range,
      cards: {
        animalsActive: animals.filter((a) => a.status === 'active').length,
        animalsTotal: animals.length,
        milkToday,
        milkWeek: sum(inRange(milk, wk.from, wk.to).map((m) => m.liters)),
        milkMonth: sum(inRange(milk, mo.from, mo.to).map((m) => m.liters)),
        feedKgToday: sum(feedToday.map((f) => f.kg)),
        feedCostToday,
        revenueToday,
        revenueKind,
        revenueActualToday: actualToday,
        revenueEstimatedToday: estimatedToday,
        balanceToday: round2(revenueToday - feedCostToday),
      },
      weekSeries: dailySeries(wk.from, wk.to, inRange(milk, wk.from, wk.to).map((m) => ({ date: m.date, value: m.liters }))),
      monthSeries: dailySeries(mo.from, mo.to, inRange(milk, mo.from, mo.to).map((m) => ({ date: m.date, value: m.liters }))),
      rangeSummary: {
        milkL: fin.milkProducedL, feedKg: fin.feedKg, feedCost: fin.feedCost, soldL: fin.milkSoldL,
        actualRevenue: fin.actualRevenue, estimatedRevenue: fin.estimatedRevenue, hasSales: fin.hasSales,
        balanceActual: fin.balanceActual, balanceEstimated: fin.balanceEstimated,
      },
      rangeSeries: dailySeries(range.from, min(range.to, today), rangeMilk.map((m) => ({ date: m.date, value: m.liters }))),
      perAnimal,
      recentMilk,
      recentFeed,
      pricesMissing: { milk: !history.some((h) => h.kind === 'milk' && h.price > 0), feed: !history.some((h) => h.kind === 'feed' && h.price > 0) },
      hasAnimals: byId.size > 0,
    });
  }));

  // ------------------------------------------------------- sut statistikasi
  r.get('/reports/milk', wrap(async (req, res) => {
    const s = await getSettingsRow(db);
    const today = todayIn(s.timezone);
    const wk = weekRange(today), mo = monthRange(today);
    const range = rangeQuery(req, { from: wk.from, to: wk.to });
    // Hali kelmagan kunlar hisobga olinmaydi (o'rtacha va taqqoslash adolatli bo'lishi uchun)
    const effTo = range.from > today ? range.to : min(range.to, today);
    const elapsed = range.from > today ? 0 : diffDays(range.from, effTo) + 1;
    const prev = previousPeriod(range.from, effTo);
    const weeks = weekRangesEndingAt(effTo, 8);
    const months = monthRangesEndingAt(effTo, 6);
    const lo = [prev.from, weeks[0].from, months[0].from, wk.from, mo.from].reduce(min);
    const hi = [range.to, wk.to, mo.to, weeks[7].to, months[5].to].reduce(max);

    const [animals, milk] = await Promise.all([loadAnimals(db), milkRows(db, lo, hi)]);
    const cur = inRange(milk, range.from, effTo);
    const prevRows = inRange(milk, prev.from, prev.to);
    const total = sum(cur.map((m) => m.liters));
    const prevTotal = sum(prevRows.map((m) => m.liters));

    const compare = compareAnimals(animals.map((a) => a.id), cur, prevRows);
    const nameOf = new Map(animals.map((a) => [a.id, a]));
    const perAnimal = compare
      .map((c) => {
        const a = nameOf.get(c.animalId)!;
        return { ...c, name: a.name, tag: a.tag, status: a.status, avgPerDay: elapsed ? round2(c.liters / elapsed) : 0, sharePct: total > 0 ? round2((c.liters / total) * 100) : 0 };
      })
      .filter((a) => a.status === 'active' || a.liters > 0 || a.previousLiters > 0)
      .sort((a, b) => b.liters - a.liters);

    const periodTotal = (f: string, t: string) => sum(inRange(milk, f, t).map((m) => m.liters));
    const withChange = (list: { from: string; to: string; liters: number }[]) =>
      list.map((x, i) => ({ ...x, partial: x.to > today, changePct: i > 0 && list[i - 1].liters > 0 ? round2(((x.liters - list[i - 1].liters) / list[i - 1].liters) * 100) : null }));

    res.json({
      today,
      range,
      effectiveTo: effTo,
      previous: { ...prev, liters: prevTotal, changePct: prevTotal > 0 ? round2(((total - prevTotal) / prevTotal) * 100) : null },
      totals: {
        liters: total,
        elapsedDays: elapsed,
        recordDays: new Set(cur.map((m) => m.date)).size,
        dailyAverage: elapsed ? round2(total / elapsed) : 0,
      },
      current: { today: periodTotal(today, today), week: periodTotal(wk.from, wk.to), month: periodTotal(mo.from, mo.to), weekRange: wk, monthRange: mo },
      daily: dailySeries(range.from, range.to, cur.map((m) => ({ date: m.date, value: m.liters }))),
      weeks: withChange(weeks.map((w) => ({ ...w, liters: periodTotal(w.from, w.to) }))),
      months: withChange(months.map((m) => ({ ...m, liters: periodTotal(m.from, m.to) }))),
      perAnimal,
      top: perAnimal.filter((a) => a.liters > 0).slice(0, 5),
      decreased: decreasedAnimals(compare).map((c) => ({ ...c, name: nameOf.get(c.animalId)!.name, tag: nameOf.get(c.animalId)!.tag })),
    });
  }));

  // ------------------------------------------------------------------ moliya
  r.get('/reports/finance', wrap(async (req, res) => {
    const s = await getSettingsRow(db);
    const today = todayIn(s.timezone);
    const wk = weekRange(today), mo = monthRange(today);
    const range = rangeQuery(req, { from: mo.from, to: today });
    const lo = [range.from, wk.from, mo.from].reduce(min), hi = [range.to, wk.to, mo.to].reduce(max);

    const [animals, milk, feed, sales, expenses, history] = await Promise.all([
      loadAnimals(db), milkRows(db, lo, hi), feedRows(db, lo, hi), saleRows(db, lo, hi), expenseRows(db, lo, hi), getPriceHistory(db),
    ]);
    const fin = (f: string, t: string) =>
      computeFinance({ milk: inRange(milk, f, t), feed: inRange(feed, f, t), sales: inRange(sales, f, t), expenses: inRange(expenses, f, t), history });

    const rMilk = inRange(milk, range.from, range.to);
    const rFeed = inRange(feed, range.from, range.to);

    // Grafik: 92 kungacha — kunlik, undan uzun bo'lsa — oylik
    const days = diffDays(range.from, range.to) + 1;
    const buckets: { label: string; from: string; to: string }[] = days <= 92
      ? eachDay(range.from, range.to).map((d) => ({ label: d, from: d, to: d }))
      : (() => {
          const out: { label: string; from: string; to: string }[] = [];
          for (let m = monthStart(range.from); m <= range.to; m = addDays(monthEnd(m), 1)) out.push({ label: m, from: max(m, range.from), to: min(monthEnd(m), range.to) });
          return out;
        })();
    const series = buckets.map((b) => {
      const f = fin(b.from, b.to);
      return { label: b.label, from: b.from, to: b.to, revenueActual: f.actualRevenue, revenueEstimated: f.estimatedRevenue, feedCost: f.feedCost, expenses: f.additionalExpenses };
    });

    const names = new Map(animals.map((a) => [a.id, a]));
    const perAnimal = perAnimalFinance(animals.map((a) => a.id), rMilk, rFeed, history)
      .map((p) => ({ ...p, name: names.get(p.animalId)!.name, tag: names.get(p.animalId)!.tag, status: names.get(p.animalId)!.status }))
      .filter((p) => p.milkL > 0 || p.feedKg > 0 || p.feedCost > 0)
      .sort((a, b) => b.difference - a.difference);

    const byCategory = new Map<string, number>();
    for (const e of inRange(expenses, range.from, range.to)) byCategory.set(e.category, (byCategory.get(e.category) ?? 0) + e.amount);

    res.json({
      today,
      range,
      totals: fin(range.from, range.to),
      periods: { day: fin(today, today), week: fin(wk.from, wk.to), month: fin(mo.from, mo.to), weekRange: wk, monthRange: mo },
      granularity: days <= 92 ? 'day' : 'month',
      series,
      perAnimal,
      expensesByCategory: [...byCategory.entries()].map(([category, amount]) => ({ category, amount: round2(amount) })).sort((a, b) => b.amount - a.amount),
    });
  }));

  return r;
}
