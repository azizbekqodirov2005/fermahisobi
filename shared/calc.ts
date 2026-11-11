import { addDays, diffDays, eachDay, monthsBetween, monthStart, monthEnd, weekStart, weekEnd, addMonths } from './dates';
import type { PriceKind, PriceRow } from './types';

export const round2 = (n: number) => Math.round((n + Number.EPSILON * Math.sign(n)) * 100) / 100;
export const sum = (xs: number[]) => round2(xs.reduce((a, b) => a + b, 0));

/** Kunlik jami: ertalab + kechqurun + qo'shimcha (har bir sessiya faqat bir marta hisoblanadi). */
export function dailyTotal(morning: number, evening: number, extra = 0): number {
  return round2(morning + evening + extra);
}

// --------------------------------------------------------------------- yosh
export function computeAge(
  a: { birthDate: string | null; ageYears: number | null; ageMonths: number | null; ageRecordedOn: string | null },
  today: string,
): { years: number; months: number } | null {
  let total: number;
  if (a.birthDate) {
    total = monthsBetween(a.birthDate, today);
  } else if (a.ageYears !== null || a.ageMonths !== null) {
    const base = (a.ageYears ?? 0) * 12 + (a.ageMonths ?? 0);
    total = base + (a.ageRecordedOn ? monthsBetween(a.ageRecordedOn, today) : 0);
  } else return null;
  return { years: Math.floor(total / 12), months: total % 12 };
}

// -------------------------------------------------------------------- narxlar
/** Berilgan sanada amal qilgan narx: effective_from <= sana bo'lgan eng so'nggi yozuv. */
export function priceOn(history: Pick<PriceRow, 'kind' | 'price' | 'effectiveFrom'>[], kind: PriceKind, date: string): number {
  let best: { price: number; effectiveFrom: string } | null = null;
  for (const h of history) {
    if (h.kind !== kind || h.effectiveFrom > date) continue;
    if (!best || h.effectiveFrom > best.effectiveFrom) best = h;
  }
  return best ? best.price : 0;
}

// --------------------------------------------------------------- davrlar
export function previousPeriod(from: string, to: string): { from: string; to: string } {
  const len = diffDays(from, to) + 1;
  return { from: addDays(from, -len), to: addDays(from, -1) };
}

export function weekRangesEndingAt(date: string, count: number): { from: string; to: string }[] {
  const end = weekStart(date);
  return Array.from({ length: count }, (_, i) => {
    const s = addDays(end, -7 * (count - 1 - i));
    return { from: s, to: weekEnd(s) };
  });
}
export function monthRangesEndingAt(date: string, count: number): { from: string; to: string }[] {
  const end = monthStart(date);
  return Array.from({ length: count }, (_, i) => {
    const s = addMonths(end, -(count - 1 - i));
    return { from: s, to: monthEnd(s) };
  });
}

// ------------------------------------------------------------ qatorlarni yig'ish
export interface DatedValue { date: string; value: number }

/** Kunlar bo'yicha yig'indi; yozuvsiz kunlar 0 bilan to'ldiriladi. */
export function dailySeries(from: string, to: string, rows: DatedValue[]): DatedValue[] {
  const map = new Map<string, number>();
  for (const r of rows) map.set(r.date, (map.get(r.date) ?? 0) + r.value);
  return eachDay(from, to).map((date) => ({ date, value: round2(map.get(date) ?? 0) }));
}

export interface MilkRow { animalId: number; date: string; liters: number }

export interface AnimalCompare {
  animalId: number;
  liters: number;
  previousLiters: number;
  change: number;
  changePct: number | null;
}

export function compareAnimals(animalIds: number[], current: MilkRow[], previous: MilkRow[]): AnimalCompare[] {
  const cur = new Map<number, number>(), prev = new Map<number, number>();
  for (const r of current) cur.set(r.animalId, (cur.get(r.animalId) ?? 0) + r.liters);
  for (const r of previous) prev.set(r.animalId, (prev.get(r.animalId) ?? 0) + r.liters);
  return animalIds.map((animalId) => {
    const liters = round2(cur.get(animalId) ?? 0);
    const previousLiters = round2(prev.get(animalId) ?? 0);
    const change = round2(liters - previousLiters);
    return { animalId, liters, previousLiters, change, changePct: previousLiters > 0 ? round2((change / previousLiters) * 100) : null };
  });
}

/** Sut hajmi kamaygan mollar (oldingi teng davrga nisbatan). */
export function decreasedAnimals(rows: AnimalCompare[]): AnimalCompare[] {
  return rows.filter((r) => r.previousLiters > 0 && r.change < -0.005).sort((a, b) => (a.changePct ?? 0) - (b.changePct ?? 0));
}

export interface FeedRow { animalId: number; date: string; kg: number; cost: number }
export interface SaleRow { date: string; liters: number; revenue: number }
export interface ExpenseRow { date: string; amount: number }

/** Ishlab chiqarilgan sutdan taxminiy daromad: har bir kun uchun o'sha kunda amal qilgan narx bilan. */
export function estimateRevenue(milk: MilkRow[], history: PriceRow[]): number {
  return sum(milk.map((m) => m.liters * priceOn(history, 'milk', m.date)));
}

export interface FinanceTotals {
  milkProducedL: number;
  milkSoldL: number;
  hasSales: boolean;
  actualRevenue: number;
  estimatedRevenue: number;
  feedKg: number;
  feedCost: number;
  additionalExpenses: number;
  hasExpenses: boolean;
  /** Haqiqiy sotuv daromadi − yemish xarajati */
  balanceActual: number;
  /** Taxminiy daromad − yemish xarajati (sotuv kiritilmagan bo'lsa) */
  balanceEstimated: number;
  /** Haqiqiy daromad − yemish − qo'shimcha xarajatlar */
  balanceAfterExpensesActual: number;
  balanceAfterExpensesEstimated: number;
}

export function computeFinance(input: { milk: MilkRow[]; feed: FeedRow[]; sales: SaleRow[]; expenses: ExpenseRow[]; history: PriceRow[] }): FinanceTotals {
  const milkProducedL = sum(input.milk.map((m) => m.liters));
  const milkSoldL = sum(input.sales.map((s) => s.liters));
  const actualRevenue = sum(input.sales.map((s) => s.revenue));
  const estimatedRevenue = estimateRevenue(input.milk, input.history);
  const feedKg = sum(input.feed.map((f) => f.kg));
  const feedCost = sum(input.feed.map((f) => f.cost));
  const additionalExpenses = sum(input.expenses.map((e) => e.amount));
  return {
    milkProducedL,
    milkSoldL,
    hasSales: input.sales.length > 0,
    actualRevenue,
    estimatedRevenue,
    feedKg,
    feedCost,
    additionalExpenses,
    hasExpenses: input.expenses.length > 0,
    balanceActual: round2(actualRevenue - feedCost),
    balanceEstimated: round2(estimatedRevenue - feedCost),
    balanceAfterExpensesActual: round2(actualRevenue - feedCost - additionalExpenses),
    balanceAfterExpensesEstimated: round2(estimatedRevenue - feedCost - additionalExpenses),
  };
}

export interface AnimalFinance {
  animalId: number;
  milkL: number;
  feedKg: number;
  feedCost: number;
  /** Faqat taxminiy: sotuvlar molga bog'lanmagan. */
  estimatedRevenue: number;
  difference: number;
}

export function perAnimalFinance(animalIds: number[], milk: MilkRow[], feed: FeedRow[], history: PriceRow[]): AnimalFinance[] {
  return animalIds.map((animalId) => {
    const m = milk.filter((r) => r.animalId === animalId);
    const f = feed.filter((r) => r.animalId === animalId);
    const estimatedRevenue = estimateRevenue(m, history);
    const feedCost = sum(f.map((r) => r.cost));
    return {
      animalId,
      milkL: sum(m.map((r) => r.liters)),
      feedKg: sum(f.map((r) => r.kg)),
      feedCost,
      estimatedRevenue,
      difference: round2(estimatedRevenue - feedCost),
    };
  });
}
