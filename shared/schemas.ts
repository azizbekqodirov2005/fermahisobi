import { z } from 'zod';
import { DEFAULT_TZ, isValidYmd, todayIn } from './dates';

/** "1,5", "1 250.50", "" kabi qiymatlarni songa aylantiradi. Bo'sh satr -> undefined. */
export function toNumber(v: unknown): unknown {
  if (typeof v === 'number') return v;
  if (typeof v === 'string') {
    const t = v.trim().replace(/[\s ]/g, '').replace(',', '.');
    if (t === '') return undefined;
    return Number(t);
  }
  return v;
}

const twoDecimals = (n: number) => Math.abs(n * 100 - Math.round(n * 100)) < 1e-6;

export function qty(max: number, opts: { min?: number; zeroDefault?: boolean; label?: string } = {}) {
  const min = opts.min ?? 0;
  const base = z
    .number({ required_error: 'Qiymatni kiriting', invalid_type_error: 'Raqam kiriting' })
    .refine((n) => Number.isFinite(n), 'Raqam kiriting')
    .refine((n) => n >= 0, 'Qiymat manfiy bo‘lishi mumkin emas')
    .refine((n) => n > min || min === 0, `Qiymat ${min} dan katta bo‘lishi kerak`)
    .refine((n) => n <= max, `Qiymat ${max} dan oshmasligi kerak`)
    .refine(twoDecimals, 'Eng ko‘pi bilan 2 ta kasr raqam kiriting');
  return z.preprocess((v) => {
    const n = toNumber(v);
    return n === undefined && opts.zeroDefault ? 0 : n;
  }, base);
}

export const money = (max = 1_000_000_000) =>
  z.preprocess(
    toNumber,
    z
      .number({ required_error: 'Summani kiriting', invalid_type_error: 'Raqam kiriting' })
      .refine((n) => Number.isFinite(n), 'Raqam kiriting')
      .refine((n) => n >= 0, 'Narx manfiy bo‘lishi mumkin emas')
      .refine((n) => n <= max, 'Qiymat juda katta')
      .refine(twoDecimals, 'Eng ko‘pi bilan 2 ta kasr raqam kiriting'),
  );

const optionalMoney = (max?: number) =>
  z.preprocess((v) => (v === '' || v === null ? undefined : v), money(max).optional());

export const ymd = (label = 'Sana') =>
  z
    .string({ required_error: `${label}ni kiriting`, invalid_type_error: `${label} noto‘g‘ri` })
    .refine(isValidYmd, `${label} noto‘g‘ri (YYYY-MM-DD)`);

const emptyToNull = (v: unknown) => (typeof v === 'string' && v.trim() === '' ? null : v);
const text = (max: number, label: string) => z.string().trim().max(max, `${label} ${max} belgidan oshmasligi kerak`);
const optionalText = (max: number, label: string) =>
  z.preprocess(emptyToNull, text(max, label).nullable().optional()).transform((v) => v ?? null);

const id = z.preprocess(toNumber, z.number({ required_error: 'Tanlang', invalid_type_error: 'Tanlang' }).int().positive('Tanlang'));

// ------------------------------------------------------------------ animals
const optInt = (max: number, label: string) =>
  z.preprocess(
    (v) => { const n = toNumber(v); return n === null ? undefined : n; },
    z.number({ invalid_type_error: 'Raqam kiriting' }).int(`${label} butun son bo‘lishi kerak`).min(0, 'Manfiy bo‘lishi mumkin emas').max(max, `Eng ko‘pi ${max}`).optional(),
  );

export const animalSchema = z
  .object({
    tagNumber: text(30, 'Raqam').min(1, 'Mol raqamini (birka) kiriting'),
    name: text(60, 'Nomi').min(1, 'Mol nomini kiriting'),
    birthDate: z.preprocess(emptyToNull, ymd('Tug‘ilgan sana').nullable().optional()).transform((v) => v ?? null),
    ageYears: optInt(40, 'Yosh'),
    ageMonths: optInt(11, 'Oy'),
    dailyFeedKg: qty(500, { zeroDefault: true }),
    notes: optionalText(1000, 'Izoh'),
    status: z.enum(['active', 'inactive'], { errorMap: () => ({ message: 'Holatni tanlang' }) }).default('active'),
    dateAdded: z.preprocess(emptyToNull, ymd('Qo‘shilgan sana').nullable().optional()).transform((v) => v ?? null),
  })
  .superRefine((v, ctx) => {
    if (v.birthDate && v.birthDate > todayIn(DEFAULT_TZ)) {
      ctx.addIssue({ code: 'custom', path: ['birthDate'], message: 'Tug‘ilgan sana kelajakda bo‘lishi mumkin emas' });
    }
    if (!v.birthDate && v.ageYears === undefined && v.ageMonths === undefined) {
      ctx.addIssue({ code: 'custom', path: ['birthDate'], message: 'Tug‘ilgan sanani yoki yoshni kiriting' });
    }
  });
export type AnimalInput = z.output<typeof animalSchema>;

// -------------------------------------------------------------------- milk
export const milkSchema = z.object({
  animalId: id,
  recordDate: ymd('Sana'),
  morningL: qty(200, { zeroDefault: true }),
  eveningL: qty(200, { zeroDefault: true }),
  extraL: qty(200, { zeroDefault: true }),
  notes: optionalText(500, 'Izoh'),
});
export type MilkInput = z.output<typeof milkSchema>;

export const milkBulkSchema = z.object({
  recordDate: ymd('Sana'),
  rows: z
    .array(z.object({ animalId: id, morningL: qty(200, { zeroDefault: true }), eveningL: qty(200, { zeroDefault: true }), extraL: qty(200, { zeroDefault: true }) }))
    .min(1, 'Kamida bitta mol uchun sut kiriting')
    .max(500),
});

// -------------------------------------------------------------------- feed
export const feedCreateSchema = z.object({
  recordDate: ymd('Sana'),
  feedType: z.preprocess((v) => (v == null ? '' : v), text(60, 'Yem turi')).default(''),
  pricePerKg: optionalMoney(),
  notes: optionalText(500, 'Izoh'),
  skipExisting: z.boolean().optional().default(false),
  items: z
    .array(z.object({ animalId: id, quantityKg: qty(5000) }))
    .min(1, 'Kamida bitta molni tanlang')
    .max(500)
    .refine((items) => new Set(items.map((i) => i.animalId)).size === items.length, 'Bitta mol ikki marta tanlangan'),
});
export type FeedCreateInput = z.output<typeof feedCreateSchema>;

export const feedUpdateSchema = z.object({
  recordDate: ymd('Sana'),
  feedType: z.preprocess((v) => (v == null ? '' : v), text(60, 'Yem turi')).default(''),
  quantityKg: qty(5000),
  pricePerKg: money(),
  notes: optionalText(500, 'Izoh'),
});

// ------------------------------------------------------- feed types / ration
export const feedTypeSchema = z.object({
  name: text(60, 'Yem turi nomi').min(1, 'Yem turi nomini kiriting'),
  pricePerKg: money(),
});
export type FeedTypeInput = z.output<typeof feedTypeSchema>;

/** Bir nechta yem turini (har biri o'z kg va narxi bilan) bir yoki bir nechta molga kiritish. */
export const rationCreateSchema = z.object({
  recordDate: ymd('Sana'),
  notes: optionalText(500, 'Izoh'),
  skipExisting: z.boolean().optional().default(false),
  animalIds: z.array(id).min(1, 'Kamida bitta molni tanlang').max(500)
    .refine((a) => new Set(a).size === a.length, 'Bitta mol ikki marta tanlangan'),
  lines: z
    .array(z.object({
      feedType: text(60, 'Yem turi').min(1, 'Yem turini kiriting'),
      quantityKg: qty(5000, { min: 0 }).refine((n) => (n as number) > 0, 'Kg 0 dan katta bo‘lishi kerak'),
      pricePerKg: money(),
    }))
    .min(1, 'Kamida bitta yem turini kiriting')
    .max(30)
    .refine((l) => new Set(l.map((x) => x.feedType.trim().toLowerCase())).size === l.length, 'Bir xil yem turi ikki marta yozilgan'),
});
export type RationCreateInput = z.output<typeof rationCreateSchema>;

// ------------------------------------------------------------------- sales
export const saleSchema = z.object({
  saleDate: ymd('Sana'),
  quantityL: qty(100000, { min: 0 }).refine((n) => (n as number) > 0, 'Litr 0 dan katta bo‘lishi kerak'),
  pricePerL: optionalMoney(),
  customerName: optionalText(100, 'Mijoz nomi'),
  notes: optionalText(500, 'Izoh'),
});

// ---------------------------------------------------------------- expenses
export const EXPENSE_CATEGORIES = ['Veterinariya', 'Dori-darmon', 'Ish haqi', 'Kommunal xizmatlar', 'Ta’mirlash', 'Transport', 'Boshqa'];
export const expenseSchema = z.object({
  expenseDate: ymd('Sana'),
  category: text(60, 'Turkum').min(1, 'Xarajat turini kiriting'),
  amount: money(),
  description: optionalText(500, 'Izoh'),
});

// ---------------------------------------------------------------- settings
export const settingsSchema = z.object({
  farmName: text(80, 'Ferma nomi').min(1, 'Ferma nomini kiriting'),
  currencyLabel: z.enum(["so'm", 'UZS'], { errorMap: () => ({ message: 'Valyuta ko‘rinishini tanlang' }) }),
});
export const priceSchema = z.object({
  kind: z.enum(['milk', 'feed']),
  price: money(),
  effectiveFrom: ymd('Amal qilish sanasi'),
});
