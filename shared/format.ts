// O'zbekcha raqam formatlari: minglik ajratgich — probel, kasr — vergul.
function group(intPart: string): string {
  return intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}

export function formatNumber(n: number | null | undefined, maxFrac = 2): string {
  if (n === null || n === undefined || Number.isNaN(n)) return '—';
  const f = Math.pow(10, maxFrac);
  const rounded = Math.round((n + Number.EPSILON * Math.sign(n)) * f) / f;
  const neg = rounded < 0;
  const [i, frac] = Math.abs(rounded).toFixed(maxFrac).split('.');
  const fracTrim = (frac ?? '').replace(/0+$/, '');
  return `${neg ? '−' : ''}${group(i)}${fracTrim ? ',' + fracTrim : ''}`;
}

export function formatLiters(n: number | null | undefined): string {
  return `${formatNumber(n, 2)} L`;
}
export function formatKg(n: number | null | undefined): string {
  return `${formatNumber(n, 2)} kg`;
}
export function formatMoney(n: number | null | undefined, label = "so'm"): string {
  if (n === null || n === undefined || Number.isNaN(n)) return '—';
  return `${formatNumber(n, 0)} ${label}`;
}
export function formatPercent(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return '—';
  return `${n > 0 ? '+' : ''}${formatNumber(n, 1)}%`;
}

export function formatAge(age: { years: number; months: number } | null | undefined): string {
  if (!age) return '—';
  const parts: string[] = [];
  if (age.years > 0) parts.push(`${age.years} yosh`);
  if (age.months > 0 || age.years === 0) parts.push(`${age.months} oy`);
  return parts.join(' ');
}
