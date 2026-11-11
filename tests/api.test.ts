import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../server/app';
import { migrate, openPglite, type Db } from '../server/db';
import { addDays, todayIn, weekRange } from '../shared/dates';
import { readFileSync } from 'node:fs';
import { FEED_TYPES_SQL } from '../server/schema-embedded';

let db: Db, server: Server, base: string;
const today = todayIn('Asia/Tashkent');

async function call(method: string, url: string, body?: unknown, token?: string) {
  const res = await fetch(base + url, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = await res.json().catch(() => null);
  return { status: res.status, body: json as any };
}

beforeAll(async () => {
  db = await openPglite(); // xotirada, test uchun
  await migrate(db);
  const app = createApp(db, { sessionSecret: 'test' });
  await new Promise<void>((r) => { server = app.listen(0, r); });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`;
});
afterAll(async () => { server.close(); await db.close(); });

let a1 = 0, a2 = 0;

describe('mollar', () => {
  it('mol qo‘shadi va yoshini hisoblaydi', async () => {
    const r = await call('POST', '/animals', { tagNumber: '101', name: 'Boychechak', birthDate: '2023-05-10', dailyFeedKg: '12,5', notes: '' });
    expect(r.status).toBe(201);
    expect(r.body.dailyFeedKg).toBe(12.5);
    expect(r.body.age.years).toBeGreaterThanOrEqual(3);
    expect(r.body.status).toBe('active');
    a1 = r.body.id;
    const r2 = await call('POST', '/animals', { tagNumber: '25', name: 'Oqqosh', ageYears: 4, ageMonths: 2, dailyFeedKg: 10 });
    expect(r2.status).toBe(201);
    expect(r2.body.age).toEqual({ years: 4, months: 2 });
    a2 = r2.body.id;
  });

  it('takroriy raqamni rad etadi (katta-kichik harfga e’tiborsiz)', async () => {
    const r = await call('POST', '/animals', { tagNumber: ' 101 ', name: 'Boshqa', ageYears: 2, dailyFeedKg: 5 });
    expect(r.status).toBe(409);
    expect(r.body.error).toMatch(/allaqachon mavjud/);
  });

  it('noto‘g‘ri kiritishni rad etadi', async () => {
    expect((await call('POST', '/animals', { tagNumber: '', name: 'X', ageYears: 1, dailyFeedKg: 1 })).status).toBe(400);
    expect((await call('POST', '/animals', { tagNumber: '7', name: 'X', dailyFeedKg: 1 })).status).toBe(400); // yosh yo'q
    expect((await call('POST', '/animals', { tagNumber: '7', name: 'X', ageYears: 1, dailyFeedKg: -4 })).status).toBe(400);
  });

  it('qidiradi, saralaydi (raqamni son sifatida), tahrirlaydi', async () => {
    const list = await call('GET', '/animals?sort=tag&dir=asc');
    expect(list.body.rows.map((a: any) => a.tagNumber)).toEqual(['25', '101']); // 25 < 101
    expect(list.body.activeCount).toBe(2);
    expect((await call('GET', '/animals?search=boych')).body.rows).toHaveLength(1);
    expect((await call('GET', '/animals?search=25')).body.rows[0].name).toBe('Oqqosh');
    const u = await call('PUT', `/animals/${a1}`, { tagNumber: '101', name: 'Boychechak 2', birthDate: '2023-05-10', dailyFeedKg: 14 });
    expect(u.body.name).toBe('Boychechak 2');
  });
});

describe('sut yozuvlari', () => {
  const d1 = addDays(today, -1);
  it('kunlik jamini avtomatik hisoblaydi', async () => {
    const r = await call('POST', '/milk', { animalId: a1, recordDate: today, morningL: '10,5', eveningL: 8.25, extraL: 2 });
    expect(r.status).toBe(201);
    expect(r.body.totalL).toBe(20.75);
  });
  it('bir mol/kun uchun takroriy yozuvni rad etadi', async () => {
    const r = await call('POST', '/milk', { animalId: a1, recordDate: today, morningL: 1, eveningL: 1 });
    expect(r.status).toBe(409);
    expect(r.body.error).toMatch(/tahrirlang/);
  });
  it('manfiy va noto‘g‘ri qiymatlarni rad etadi', async () => {
    expect((await call('POST', '/milk', { animalId: a2, recordDate: today, morningL: -2, eveningL: 1 })).status).toBe(400);
    expect((await call('POST', '/milk', { animalId: a2, recordDate: '2026-02-31', morningL: 2 })).status).toBe(400);
    expect((await call('POST', '/milk', { animalId: 99999, recordDate: today, morningL: 2 })).status).toBe(409); // mavjud bo'lmagan mol
  });
  it('tahrirlaydi — jami qayta hisoblanadi', async () => {
    const list = await call('GET', `/milk?from=${today}&to=${today}`);
    const rec = list.body.rows[0];
    const u = await call('PUT', `/milk/${rec.id}`, { animalId: a1, recordDate: today, morningL: 12, eveningL: 8, extraL: 0 });
    expect(u.body.totalL).toBe(20);
  });
  it('kunlik jadval (bulk) mavjud yozuvni yangilaydi, yangisini yaratadi — takror yo‘q', async () => {
    const r = await call('POST', '/milk/bulk', { recordDate: today, rows: [{ animalId: a1, morningL: 13, eveningL: 8 }, { animalId: a2, morningL: 9, eveningL: 7.5 }] });
    expect(r.body.saved).toBe(2);
    const list = await call('GET', `/milk?from=${today}&to=${today}`);
    expect(list.body.total).toBe(2);
    expect(list.body.sumLiters).toBe(37.5); // 21 + 16.5, ikki marta sanalmaydi
    const day = await call('GET', `/milk/day?date=${today}`);
    expect(day.body.rows.map((x: any) => x.totalL)).toEqual([16.5, 21]);
  });
  it('kecha uchun yozuv + sana/mol filtri + saralash', async () => {
    await call('POST', '/milk', { animalId: a1, recordDate: d1, morningL: 5, eveningL: 5 });
    const all = await call('GET', '/milk?sort=date&dir=asc');
    expect(all.body.rows[0].recordDate).toBe(d1);
    const byAnimal = await call('GET', `/milk?animalId=${a1}`);
    expect(byAnimal.body.total).toBe(2);
    expect(byAnimal.body.sumLiters).toBe(31);
    const byQty = await call('GET', '/milk?sort=total&dir=desc');
    expect(byQty.body.rows[0].totalL).toBe(21);
  });
});

describe('narxlar va yemish', () => {
  it('narxni o‘zgartirish tarixga yangi qator qo‘shadi', async () => {
    const r = await call('POST', '/prices', { kind: 'feed', price: '2 000', effectiveFrom: addDays(today, -10) });
    expect(r.status).toBe(201);
    expect(r.body.feedPrice).toBe(2000);
    expect(r.body.priceHistory.filter((p: any) => p.kind === 'feed').length).toBe(2);
    await call('POST', '/prices', { kind: 'milk', price: 5000, effectiveFrom: addDays(today, -10) });
  });

  it('guruhli kiritish: har bir mol uchun qator, narx yozuvda saqlanadi', async () => {
    const r = await call('POST', '/feed', { recordDate: today, feedType: 'Pichan', items: [{ animalId: a1, quantityKg: 14 }, { animalId: a2, quantityKg: '9,5' }] });
    expect(r.status).toBe(201);
    expect(r.body.created).toBe(2);
    const list = await call('GET', `/feed?from=${today}&to=${today}`);
    expect(list.body.sumKg).toBe(23.5);
    expect(list.body.sumCost).toBe(47000);
    expect(list.body.rows.every((x: any) => x.pricePerKg === 2000 && x.batchId)).toBe(true);
  });

  it('individual va guruhli yozuv ikki marta hisoblanmaydi', async () => {
    const dup = await call('POST', '/feed', { recordDate: today, feedType: 'pichan', items: [{ animalId: a1, quantityKg: 5 }] });
    expect(dup.status).toBe(409);
    expect(dup.body.error).toMatch(/Boychechak/);
    // Boshqa yem turi — ruxsat etiladi
    expect((await call('POST', '/feed', { recordDate: today, feedType: 'Omixta yem', items: [{ animalId: a1, quantityKg: 3 }] })).status).toBe(201);
    // skipExisting: mavjudlari o'tkazib yuboriladi, yangisi qo'shiladi
    const mixed = await call('POST', '/feed', { recordDate: today, feedType: 'Pichan', skipExisting: true, items: [{ animalId: a1, quantityKg: 1 }, { animalId: a2, quantityKg: 1 }] });
    expect(mixed.body).toMatchObject({ created: 0 });
    expect(mixed.body.skipped).toHaveLength(2);
    const total = await call('GET', `/feed?from=${today}&to=${today}`);
    expect(total.body.sumKg).toBe(26.5); // 14 + 9.5 + 3
  });

  it('yemishning standart miqdorini o‘zgartirish eski yozuvlarni o‘zgartirmaydi', async () => {
    await call('PUT', `/animals/${a1}`, { tagNumber: '101', name: 'Boychechak 2', birthDate: '2023-05-10', dailyFeedKg: 99 });
    const list = await call('GET', `/feed?animalId=${a1}&from=${today}&to=${today}`);
    expect(list.body.rows.map((x: any) => x.quantityKg).sort((a: number, b: number) => a - b)).toEqual([3, 14]);
  });

  it('narx o‘zgarishi tarixiy yozuvlarni o‘zgartirmaydi', async () => {
    await call('POST', '/prices', { kind: 'feed', price: 3500, effectiveFrom: today });
    const old = await call('GET', `/feed?from=${today}&to=${today}`);
    expect(old.body.sumCost).toBe(2000 * 26.5);
    // Yangi yozuv yangi narxni oladi
    const next = addDays(today, -2);
    await call('POST', '/feed', { recordDate: next, items: [{ animalId: a2, quantityKg: 10 }] });
    const n = await call('GET', `/feed?from=${next}&to=${next}`);
    expect(n.body.rows[0].pricePerKg).toBe(2000); // o'sha kunda amal qilgan narx
    const t = await call('POST', '/feed', { recordDate: addDays(today, 1), items: [{ animalId: a2, quantityKg: 10 }] });
    expect(t.status).toBe(201);
    const tl = await call('GET', `/feed?from=${addDays(today, 1)}&to=${addDays(today, 1)}`);
    expect(tl.body.rows[0].pricePerKg).toBe(3500);
    await call('DELETE', `/feed/${tl.body.rows[0].id}`);
  });

  it('manfiy yemish miqdori yoki narxini rad etadi', async () => {
    expect((await call('POST', '/feed', { recordDate: addDays(today, -5), items: [{ animalId: a1, quantityKg: -1 }] })).status).toBe(400);
    expect((await call('POST', '/feed', { recordDate: addDays(today, -5), pricePerKg: -5, items: [{ animalId: a1, quantityKg: 1 }] })).status).toBe(400);
  });
});

describe('sotuv va xarajatlar', () => {
  it('sotuv narxi o‘sha kundagi amaldagi narxdan olinadi va yozuvda saqlanadi', async () => {
    const r = await call('POST', '/sales', { saleDate: today, quantityL: 25, customerName: 'Sut zavodi' });
    expect(r.status).toBe(201);
    expect(r.body.pricePerL).toBe(5000);
    expect(r.body.totalRevenue).toBe(125000);
    // Sut narxi o'zgaradi — eski sotuv o'zgarmaydi
    await call('POST', '/prices', { kind: 'milk', price: 6000, effectiveFrom: today });
    const list = await call('GET', '/sales');
    expect(list.body.sumRevenue).toBe(125000);
    expect((await call('POST', '/sales', { saleDate: today, quantityL: 0 })).status).toBe(400);
    expect((await call('POST', '/sales', { saleDate: today, quantityL: 5, pricePerL: -1 })).status).toBe(400);
  });
  it('qo‘shimcha xarajat', async () => {
    const r = await call('POST', '/expenses', { expenseDate: today, category: 'Veterinariya', amount: 30000, description: 'Emlash' });
    expect(r.status).toBe(201);
    expect((await call('POST', '/expenses', { expenseDate: today, category: 'Boshqa', amount: -1 })).status).toBe(400);
    expect((await call('GET', '/expenses')).body.sumAmount).toBe(30000);
  });
});

describe('hisobotlar', () => {
  it('dashboard: barcha ko‘rsatkichlar yozuvlardan hisoblanadi', async () => {
    const r = await call('GET', '/dashboard');
    expect(r.status).toBe(200);
    const c = r.body.cards;
    expect(c.animalsActive).toBe(2);
    expect(c.milkToday).toBe(37.5);
    expect(c.feedKgToday).toBe(26.5);
    expect(c.feedCostToday).toBe(53000); // 14·2000 + 9,5·2000 + 3·2000 (yozuvlar o'z narxini saqlagan)
    expect(c.revenueKind).toBe('actual');
    expect(c.revenueToday).toBe(125000);
    expect(c.balanceToday).toBe(125000 - 53000);
    expect(r.body.weekSeries).toHaveLength(7);
    const w = weekRange(today);
    expect(r.body.weekSeries[0].date).toBe(w.from);
    expect(r.body.weekSeries[6].date).toBe(w.to);
    const todayPoint = r.body.weekSeries.find((p: any) => p.date === today);
    expect(todayPoint.value).toBe(37.5);
    expect(r.body.recentMilk.length).toBeGreaterThan(0);
  });

  it('dashboard: sotuv bo‘lmagan kunda daromad “taxminiy” deb belgilanadi', async () => {
    await db.query('delete from milk_sales');
    const r = await call('GET', '/dashboard');
    expect(r.body.cards.revenueKind).toBe('estimated');
    // bugun amal qiluvchi sut narxi 6000, bugungi sut 37.5 L
    expect(r.body.cards.revenueToday).toBe(37.5 * 6000);
  });

  it('sut hisoboti: hafta/oy, o‘rtacha, taqqoslash', async () => {
    const w = weekRange(today);
    const r = await call('GET', `/reports/milk?from=${w.from}&to=${w.to}`);
    expect(r.status).toBe(200);
    const expected = 37.5 + (addDays(today, -1) >= w.from ? 10 : 0);
    expect(r.body.totals.liters).toBe(expected);
    expect(r.body.current.today).toBe(37.5);
    expect(r.body.weeks).toHaveLength(8);
    expect(r.body.months).toHaveLength(6);
    expect(r.body.daily).toHaveLength(7);
    expect(r.body.perAnimal[0].name).toBeDefined();
    expect(r.body.top[0].liters).toBeGreaterThan(0);
  });

  it('moliya hisoboti: balans = haqiqiy sotuv − yemish; xarajatlar alohida', async () => {
    await call('POST', '/sales', { saleDate: today, quantityL: 20, pricePerL: 4500 });
    const r = await call('GET', `/reports/finance?from=${addDays(today, -7)}&to=${today}`);
    const t = r.body.totals;
    expect(t.actualRevenue).toBe(90000);
    expect(t.hasSales).toBe(true);
    expect(t.milkSoldL).toBe(20);
    expect(t.milkProducedL).toBe(47.5);
    expect(t.feedCost).toBe(2000 * 26.5 + 2000 * 10);
    expect(t.balanceActual).toBe(90000 - t.feedCost);
    expect(t.additionalExpenses).toBe(30000);
    expect(t.balanceAfterExpensesActual).toBe(90000 - t.feedCost - 30000);
    expect(r.body.perAnimal.length).toBe(2);
    expect(r.body.series.length).toBe(8);
  });

  it('noto‘g‘ri sana oralig‘ini rad etadi', async () => {
    expect((await call('GET', `/reports/milk?from=${today}&to=${addDays(today, -3)}`)).status).toBe(400);
    expect((await call('GET', '/dashboard?from=abc')).status).toBe(400);
  });
});

describe('tarixni saqlash', () => {
  it('tarixi bor molni o‘chirib bo‘lmaydi, nofaol qilish tarixni saqlaydi', async () => {
    const del = await call('DELETE', `/animals/${a1}`);
    expect(del.status).toBe(409);
    expect(del.body.error).toMatch(/Nofaol/);
    const off = await call('PATCH', `/animals/${a1}/status`, { status: 'inactive' });
    expect(off.body.status).toBe('inactive');
    const milk = await call('GET', `/milk?animalId=${a1}`);
    expect(milk.body.total).toBe(2); // tarix saqlangan
    const dash = await call('GET', '/dashboard');
    expect(dash.body.cards.animalsActive).toBe(1);
    expect(dash.body.cards.milkToday).toBe(37.5); // nofaol mol sutlari o'tmish hisobotlarida qoladi
    const day = await call('GET', `/milk/day?date=${today}`);
    expect(day.body.rows.some((x: any) => x.animalId === a1)).toBe(true); // shu kuni yozuvi bor
  });
  it('tarixsiz molni o‘chiradi', async () => {
    const r = await call('POST', '/animals', { tagNumber: 'T-1', name: 'Vaqtincha', ageYears: 1, dailyFeedKg: 1 });
    expect((await call('DELETE', `/animals/${r.body.id}`)).status).toBe(200);
    expect((await call('GET', `/animals/${r.body.id}`)).status).toBe(404);
  });
  it('mol profili statistikasi', async () => {
    const r = await call('GET', `/animals/${a2}`);
    expect(r.body.stats.milkTotalL).toBe(16.5);
    expect(r.body.stats.feedTotalKg).toBe(19.5);
    expect(r.body.recentMilk).toHaveLength(1);
  });
});

describe('yem turlari va ratsion', () => {
  it('Netlify uchun joylangan SQL migratsiya fayli bilan bir xil va qayta ishga tushirilganda xato bermaydi', async () => {
    expect(FEED_TYPES_SQL).toBe(readFileSync('supabase/migrations/0002_feed_types.sql', 'utf8'));
    await db.exec(FEED_TYPES_SQL);
    await db.exec(FEED_TYPES_SQL);
  });

  const D = '2020-01-15'; // boshqa testlar bilan aralashmasligi uchun alohida sana
  let typeId = 0, x1 = 0, x2 = 0;

  it('sinov mollarini yaratadi', async () => {
    x1 = (await call('POST', '/animals', { tagNumber: 'R1', name: 'Ratsion-1', ageYears: 3, ageMonths: 0, dailyFeedKg: 0 })).body.id;
    x2 = (await call('POST', '/animals', { tagNumber: 'R2', name: 'Ratsion-2', ageYears: 3, ageMonths: 0, dailyFeedKg: 0 })).body.id;
    expect(x1 && x2).toBeTruthy();
  });

  it('yem turi katalogini yuritadi (qo‘shish, dublikat, tahrir)', async () => {
    const c = await call('POST', '/feed-types', { name: 'Silos', pricePerKg: 500 });
    expect(c.status).toBe(201);
    typeId = c.body.id;
    expect((await call('POST', '/feed-types', { name: ' silos ', pricePerKg: 1 })).status).toBe(409);
    expect((await call('POST', '/feed-types', { name: 'Pichan', pricePerKg: -1 })).status).toBe(400);
    expect((await call('POST', '/feed-types', { name: '', pricePerKg: 1 })).status).toBe(400);
    await call('POST', '/feed-types', { name: 'Omixta yem', pricePerKg: '2 500' });
    const list = await call('GET', '/feed-types');
    expect(list.body.map((t: any) => t.name)).toEqual(['Omixta yem', 'Silos']);
    expect(list.body.find((t: any) => t.name === 'Omixta yem').pricePerKg).toBe(2500);
  });

  it('bir nechta yem turini kg × narx bilan kiritadi: silos 18 kg × 500 = 9 000', async () => {
    const r = await call('POST', '/feed/ration', {
      recordDate: D, animalIds: [x1],
      lines: [{ feedType: 'Silos', quantityKg: 18, pricePerKg: 500 }, { feedType: 'Omixta yem', quantityKg: '4,5', pricePerKg: 2500 }],
    });
    expect(r.status).toBe(201);
    expect(r.body.created).toBe(2);
    const f = await call('GET', `/feed?from=${D}&to=${D}`);
    expect(f.body.total).toBe(2);
    const silos = f.body.rows.find((x: any) => x.feedType === 'Silos');
    expect(silos.totalCost).toBe(9000);
    expect(f.body.sumKg).toBe(22.5);
    expect(f.body.sumCost).toBe(9000 + 11250);
    expect(f.body.perType.map((t: any) => [t.feedType, t.kg, t.cost, t.avgPrice])).toEqual([['Omixta yem', 4.5, 11250, 2500], ['Silos', 18, 9000, 500]]);
  });

  it('katalogdagi narxni o‘zgartirish eski yozuvlarni o‘zgartirmaydi', async () => {
    const u = await call('PUT', `/feed-types/${typeId}`, { name: 'Silos', pricePerKg: 900 });
    expect(u.status).toBe(200);
    expect(u.body.pricePerKg).toBe(900);
    const f = await call('GET', `/feed?from=${D}&to=${D}`);
    expect(f.body.rows.find((x: any) => x.feedType === 'Silos').totalCost).toBe(9000);
  });

  it('ikki marta hisoblamaydi: takroriy yozuv rad etiladi yoki o‘tkazib yuboriladi', async () => {
    const body = { recordDate: D, animalIds: [x1, x2], lines: [{ feedType: 'silos', quantityKg: 10, pricePerKg: 500 }] };
    const dup = await call('POST', '/feed/ration', body);
    expect(dup.status).toBe(409);
    const ok = await call('POST', '/feed/ration', { ...body, skipExisting: true });
    expect(ok.status).toBe(201);
    expect(ok.body.created).toBe(1);
    expect(ok.body.skipped).toBe(1);
    const f = await call('GET', `/feed?from=${D}&to=${D}`);
    expect(f.body.total).toBe(3);
    expect(f.body.perType.find((t: any) => t.feedType === 'Silos').kg).toBe(28);
  });

  it('noto‘g‘ri ratsionni rad etadi', async () => {
    const bad = (b: object) => call('POST', '/feed/ration', { recordDate: D, animalIds: [x1], lines: [{ feedType: 'Pichan', quantityKg: 1, pricePerKg: 1 }], ...b });
    expect((await bad({ lines: [{ feedType: 'Pichan', quantityKg: -2, pricePerKg: 1 }] })).status).toBe(400);
    expect((await bad({ lines: [{ feedType: 'Pichan', quantityKg: 0, pricePerKg: 1 }] })).status).toBe(400);
    expect((await bad({ lines: [{ feedType: 'Pichan', quantityKg: 1, pricePerKg: -5 }] })).status).toBe(400);
    expect((await bad({ lines: [{ feedType: '', quantityKg: 1, pricePerKg: 1 }] })).status).toBe(400);
    expect((await bad({ lines: [{ feedType: 'Pichan', quantityKg: 1, pricePerKg: 1 }, { feedType: 'PICHAN', quantityKg: 2, pricePerKg: 1 }] })).status).toBe(400);
    expect((await bad({ animalIds: [] })).status).toBe(400);
    expect((await bad({ animalIds: [999999] })).status).toBe(404);
    expect((await bad({ recordDate: '2020-02-31' })).status).toBe(400);
  });

  it('yem turini katalogdan o‘chirish yozuvlarni o‘chirmaydi', async () => {
    expect((await call('DELETE', `/feed-types/${typeId}`)).status).toBe(200);
    expect((await call('DELETE', `/feed-types/${typeId}`)).status).toBe(404);
    const f = await call('GET', `/feed?from=${D}&to=${D}`);
    expect(f.body.total).toBe(3);
  });
});

describe('autentifikatsiya', () => {
  it('parol o‘rnatilganda tokensiz kirishni rad etadi', async () => {
    const db2 = await openPglite();
    await migrate(db2);
    const app = createApp(db2, { sessionSecret: 'secret', appPassword: 'maxfiy' });
    const s: Server = await new Promise((r) => { const x = app.listen(0, () => r(x)); });
    const b = `http://127.0.0.1:${(s.address() as AddressInfo).port}/api`;
    expect((await fetch(`${b}/animals`)).status).toBe(401);
    expect((await fetch(`${b}/health`)).status).toBe(200);
    const bad = await fetch(`${b}/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: 'xato' }) });
    expect(bad.status).toBe(401);
    const ok = await (await fetch(`${b}/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: 'maxfiy' }) })).json();
    const authed = await fetch(`${b}/animals`, { headers: { Authorization: `Bearer ${ok.token}` } });
    expect(authed.status).toBe(200);
    expect((await fetch(`${b}/animals`, { headers: { Authorization: 'Bearer buzilgan.token' } })).status).toBe(401);
    s.close(); await db2.close();
  });
});
