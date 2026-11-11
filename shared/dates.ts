// Barcha sanalar "YYYY-MM-DD" satri ko'rinishida saqlanadi va UTC arifmetikasi bilan hisoblanadi —
// shu tufayli vaqt mintaqasi (DST, brauzer sozlamalari) hisob-kitobga ta'sir qilmaydi.
export const DEFAULT_TZ = 'Asia/Tashkent';

export const MONTHS_UZ = ['yanvar', 'fevral', 'mart', 'aprel', 'may', 'iyun', 'iyul', 'avgust', 'sentabr', 'oktabr', 'noyabr', 'dekabr'];
export const MONTHS_UZ_CAP = MONTHS_UZ.map((m) => m[0].toUpperCase() + m.slice(1));
export const MONTHS_UZ_SHORT = ['Yan', 'Fev', 'Mar', 'Apr', 'May', 'Iyn', 'Iyl', 'Avg', 'Sen', 'Okt', 'Noy', 'Dek'];
export const WEEKDAYS_UZ_SHORT = ['Du', 'Se', 'Ch', 'Pa', 'Ju', 'Sh', 'Ya']; // Dushanba..Yakshanba

const YMD = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isValidYmd(s: unknown): s is string {
  if (typeof s !== 'string') return false;
  const m = YMD.exec(s);
  if (!m) return false;
  const y = +m[1], mo = +m[2], d = +m[3];
  if (y < 2000 || y > 2100) return false;
  const dt = new Date(Date.UTC(y, mo - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d;
}

export function parseYmd(s: string): { y: number; m: number; d: number } {
  const m = YMD.exec(s);
  if (!m) throw new Error(`Noto'g'ri sana: ${s}`);
  return { y: +m[1], m: +m[2], d: +m[3] };
}

const pad = (n: number) => String(n).padStart(2, '0');
export const toYmd = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`;
const fromDate = (dt: Date) => toYmd(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate());
const toDate = (s: string) => { const { y, m, d } = parseYmd(s); return new Date(Date.UTC(y, m - 1, d)); };

export function addDays(s: string, n: number): string {
  const dt = toDate(s);
  dt.setUTCDate(dt.getUTCDate() + n);
  return fromDate(dt);
}

/** a dan b gacha kunlar farqi (b - a). */
export function diffDays(a: string, b: string): number {
  return Math.round((toDate(b).getTime() - toDate(a).getTime()) / 86400000);
}

/** 0 = Dushanba ... 6 = Yakshanba */
export function weekdayIndex(s: string): number {
  return (toDate(s).getUTCDay() + 6) % 7;
}

/** Hafta har doim Dushanba–Yakshanba. */
export function weekStart(s: string): string { return addDays(s, -weekdayIndex(s)); }
export function weekEnd(s: string): string { return addDays(weekStart(s), 6); }
export function weekRange(s: string) { return { from: weekStart(s), to: weekEnd(s) }; }

export function monthStart(s: string): string { const { y, m } = parseYmd(s); return toYmd(y, m, 1); }
export function monthEnd(s: string): string {
  const { y, m } = parseYmd(s);
  return toYmd(y, m, new Date(Date.UTC(y, m, 0)).getUTCDate());
}
export function monthRange(s: string) { return { from: monthStart(s), to: monthEnd(s) }; }

/** Oyni n ga surish (oyning 1-kuniga). */
export function addMonths(s: string, n: number): string {
  const { y, m } = parseYmd(s);
  const idx = y * 12 + (m - 1) + n;
  return toYmd(Math.floor(idx / 12), (idx % 12) + 1, 1);
}

export function eachDay(from: string, to: string): string[] {
  const out: string[] = [];
  if (from > to) return out;
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
}

export function todayIn(tz: string = DEFAULT_TZ, now: Date = new Date()): string {
  // en-CA "YYYY-MM-DD" formatini beradi
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
  return parts;
}

/** Tugallangan oylar soni (b sana a dan keyin). */
export function monthsBetween(a: string, b: string): number {
  const A = parseYmd(a), B = parseYmd(b);
  let months = (B.y - A.y) * 12 + (B.m - A.m);
  if (B.d < A.d) months -= 1;
  return Math.max(0, months);
}

export function formatDateUz(s: string | null | undefined): string {
  if (!s || !isValidYmd(s)) return '—';
  const { y, m, d } = parseYmd(s);
  return `${d}-${MONTHS_UZ[m - 1]}, ${y}`;
}
export function formatDateShort(s: string): string {
  if (!isValidYmd(s)) return s;
  const { y, m, d } = parseYmd(s);
  return `${pad(d)}.${pad(m)}.${y}`;
}
export function formatDayMonth(s: string): string {
  const { m, d } = parseYmd(s);
  return `${d}-${MONTHS_UZ_SHORT[m - 1].toLowerCase()}`;
}
export function formatMonthYear(s: string): string {
  const { y, m } = parseYmd(s);
  return `${MONTHS_UZ_CAP[m - 1]} ${y}`;
}
export function formatRangeUz(from: string, to: string): string {
  return from === to ? formatDateUz(from) : `${formatDateUz(from)} — ${formatDateUz(to)}`;
}
