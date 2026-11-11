import { describe, expect, it } from 'vitest';
import {
  compareAnimals, computeAge, computeFinance, dailySeries, dailyTotal, decreasedAnimals, estimateRevenue,
  monthRangesEndingAt, perAnimalFinance, previousPeriod, priceOn, weekRangesEndingAt,
} from '../shared/calc';
import { formatMoney, formatNumber } from '../shared/format';
import { animalSchema, feedCreateSchema, milkSchema, toNumber } from '../shared/schemas';
import type { PriceRow } from '../shared/types';

const history: PriceRow[] = [
  { id: 1, kind: 'milk', price: 0, effectiveFrom: '2000-01-01' },
  { id: 2, kind: 'milk', price: 4000, effectiveFrom: '2026-10-01' },
  { id: 3, kind: 'milk', price: 5000, effectiveFrom: '2026-10-20' },
  { id: 4, kind: 'feed', price: 2000, effectiveFrom: '2026-01-01' },
];

describe('kunlik jami', () => {
  it('ertalab + kechqurun + qo‘shimcha', () => {
    expect(dailyTotal(10.5, 8.25, 2)).toBe(20.75);
    expect(dailyTotal(0, 0, 0)).toBe(0);
  });
  it('kasr hisobida suzuvchi nuqta xatosi yo‘q', () => {
    expect(dailyTotal(0.1, 0.2, 0)).toBe(0.3);
    expect(dailyTotal(1.15, 2.15, 0.7)).toBe(4);
  });
});

describe('narxlar tarixi', () => {
  it('sanaga mos amaldagi narxni topadi', () => {
    expect(priceOn(history, 'milk', '2026-09-30')).toBe(0);
    expect(priceOn(history, 'milk', '2026-10-01')).toBe(4000);
    expect(priceOn(history, 'milk', '2026-10-19')).toBe(4000);
    expect(priceOn(history, 'milk', '2026-10-20')).toBe(5000);
    expect(priceOn(history, 'milk', '2030-01-01')).toBe(5000);
    expect(priceOn(history, 'feed', '2026-10-27')).toBe(2000);
  });
  it('taxminiy daromad har kunning o‘z narxi bilan hisoblanadi (eski kunlar o‘zgarmaydi)', () => {
    const milk = [
      { animalId: 1, date: '2026-10-10', liters: 10 }, // 4000
      { animalId: 1, date: '2026-10-25', liters: 10 }, // 5000
    ];
    expect(estimateRevenue(milk, history)).toBe(90000);
    // Narx yana o'zgarsa ham eski kunlar o'zgarmaydi
    const later = [...history, { id: 9, kind: 'milk' as const, price: 7000, effectiveFrom: '2026-10-28' }];
    expect(estimateRevenue(milk, later)).toBe(90000);
  });
});

describe('davrlar', () => {
  it('oldingi teng davr', () => {
    expect(previousPeriod('2026-10-26', '2026-11-01')).toEqual({ from: '2026-10-19', to: '2026-10-25' });
    expect(previousPeriod('2026-10-01', '2026-10-31')).toEqual({ from: '2026-08-31', to: '2026-09-30' });
  });
  it('oxirgi N hafta/oy', () => {
    const w = weekRangesEndingAt('2026-10-27', 3);
    expect(w.map((x) => x.from)).toEqual(['2026-10-12', '2026-10-19', '2026-10-26']);
    const m = monthRangesEndingAt('2026-01-15', 3);
    expect(m.map((x) => x.from)).toEqual(['2025-11-01', '2025-12-01', '2026-01-01']);
    expect(m[2].to).toBe('2026-01-31');
  });
  it('kunlik qator yozuvsiz kunlarni 0 bilan to‘ldiradi va takroriy sanalarni qo‘shadi', () => {
    const s = dailySeries('2026-10-30', '2026-11-02', [
      { date: '2026-10-30', value: 5 }, { date: '2026-10-30', value: 2.5 }, { date: '2026-11-01', value: 4 },
    ]);
    expect(s).toEqual([
      { date: '2026-10-30', value: 7.5 }, { date: '2026-10-31', value: 0 }, { date: '2026-11-01', value: 4 }, { date: '2026-11-02', value: 0 },
    ]);
  });
});

describe('mollar taqqoslash', () => {
  it('kamaygan mollarni aniqlaydi', () => {
    const cur = [{ animalId: 1, date: 'x', liters: 40 }, { animalId: 2, date: 'x', liters: 30 }, { animalId: 3, date: 'x', liters: 5 }];
    const prev = [{ animalId: 1, date: 'y', liters: 50 }, { animalId: 2, date: 'y', liters: 30 }, { animalId: 4, date: 'y', liters: 9 }];
    const cmp = compareAnimals([1, 2, 3, 4], cur, prev);
    expect(cmp.find((c) => c.animalId === 1)).toMatchObject({ change: -10, changePct: -20 });
    expect(cmp.find((c) => c.animalId === 3)?.changePct).toBeNull(); // oldingi davrda sut yo'q
    const dec = decreasedAnimals(cmp);
    expect(dec.map((d) => d.animalId)).toEqual([4, 1]); // 4: -100%, 1: -20%
  });
});

describe('moliya', () => {
  const milk = [{ animalId: 1, date: '2026-10-25', liters: 20 }, { animalId: 2, date: '2026-10-25', liters: 10 }];
  const feed = [
    { animalId: 1, date: '2026-10-25', kg: 12, cost: 24000 },
    { animalId: 2, date: '2026-10-25', kg: 10, cost: 20000 },
  ];

  it('sotuv kiritilmagan bo‘lsa daromad taxminiy, haqiqiy daromad 0', () => {
    const f = computeFinance({ milk, feed, sales: [], expenses: [], history });
    expect(f.hasSales).toBe(false);
    expect(f.actualRevenue).toBe(0);
    expect(f.estimatedRevenue).toBe(150000);
    expect(f.feedCost).toBe(44000);
    expect(f.balanceEstimated).toBe(106000);
  });

  it('ishlab chiqarilgan va sotilgan sut farq qiladi', () => {
    const f = computeFinance({ milk, feed, sales: [{ date: '2026-10-25', liters: 25, revenue: 112500 }], expenses: [], history });
    expect(f.milkProducedL).toBe(30);
    expect(f.milkSoldL).toBe(25);
    expect(f.actualRevenue).toBe(112500);
    expect(f.balanceActual).toBe(68500); // 112 500 − 44 000
  });

  it('qo‘shimcha xarajatlar alohida ayriladi', () => {
    const f = computeFinance({ milk, feed, sales: [{ date: '2026-10-25', liters: 25, revenue: 112500 }], expenses: [{ date: '2026-10-25', amount: 18500 }], history });
    expect(f.additionalExpenses).toBe(18500);
    expect(f.balanceAfterExpensesActual).toBe(50000);
    expect(f.balanceActual).toBe(68500);
  });

  it('har bir mol bo‘yicha statistika', () => {
    const [a1, a2] = perAnimalFinance([1, 2], milk, feed, history);
    expect(a1).toMatchObject({ milkL: 20, feedKg: 12, feedCost: 24000, estimatedRevenue: 100000, difference: 76000 });
    expect(a2).toMatchObject({ milkL: 10, feedCost: 20000, estimatedRevenue: 50000, difference: 30000 });
  });
});

describe('yosh', () => {
  it('tug‘ilgan sanadan hisoblaydi', () => {
    expect(computeAge({ birthDate: '2023-05-10', ageYears: null, ageMonths: null, ageRecordedOn: null }, '2026-10-27')).toEqual({ years: 3, months: 5 });
  });
  it('qo‘lda kiritilgan yoshga vaqt o‘tishi bilan oy qo‘shadi', () => {
    expect(computeAge({ birthDate: null, ageYears: 2, ageMonths: 6, ageRecordedOn: '2026-04-27' }, '2026-10-27')).toEqual({ years: 3, months: 0 });
    expect(computeAge({ birthDate: null, ageYears: null, ageMonths: null, ageRecordedOn: null }, '2026-10-27')).toBeNull();
  });
});

describe('validatsiya', () => {
  it('vergulli o‘nlik sonlarni qabul qiladi', () => {
    expect(toNumber('12,5')).toBe(12.5);
    expect(toNumber(' 1 250,50 ')).toBe(1250.5);
    expect(toNumber('')).toBeUndefined();
  });
  it('manfiy sut va yemish miqdorini rad etadi', () => {
    const bad = milkSchema.safeParse({ animalId: 1, recordDate: '2026-10-27', morningL: -1, eveningL: 5 });
    expect(bad.success).toBe(false);
    const ok = milkSchema.safeParse({ animalId: '1', recordDate: '2026-10-27', morningL: '10,5', eveningL: '', extraL: undefined });
    expect(ok.success).toBe(true);
    if (ok.success) expect(ok.data).toMatchObject({ morningL: 10.5, eveningL: 0, extraL: 0 });
    expect(feedCreateSchema.safeParse({ recordDate: '2026-10-27', items: [{ animalId: 1, quantityKg: -3 }] }).success).toBe(false);
  });
  it('narx manfiy bo‘lmaydi, sana to‘g‘ri bo‘lishi kerak', () => {
    expect(feedCreateSchema.safeParse({ recordDate: '2026-10-27', pricePerKg: -1, items: [{ animalId: 1, quantityKg: 3 }] }).success).toBe(false);
    expect(milkSchema.safeParse({ animalId: 1, recordDate: '2026-02-31', morningL: 1 }).success).toBe(false);
  });
  it('3 xonali kasrni rad etadi', () => {
    expect(milkSchema.safeParse({ animalId: 1, recordDate: '2026-10-27', morningL: '1.234' }).success).toBe(false);
  });
  it('mol: tug‘ilgan sana yoki yosh shart', () => {
    expect(animalSchema.safeParse({ tagNumber: 'A1', name: 'Boychechak', dailyFeedKg: 12 }).success).toBe(false);
    expect(animalSchema.safeParse({ tagNumber: 'A1', name: 'Boychechak', ageYears: 3, dailyFeedKg: 12 }).success).toBe(true);
    expect(animalSchema.safeParse({ tagNumber: 'A1', name: 'Boychechak', birthDate: '2999-01-01', dailyFeedKg: 12 }).success).toBe(false);
  });
});

describe('format', () => {
  it('minglik ajratgich va vergul', () => {
    expect(formatNumber(1234567.5, 2)).toBe('1 234 567,5');
    expect(formatMoney(1500000)).toBe('1 500 000 so\'m');
    expect(formatNumber(0.005, 2)).toBe('0,01');
    expect(formatNumber(-1500)).toBe('−1 500');
  });
});
