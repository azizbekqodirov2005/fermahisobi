import { describe, expect, it } from 'vitest';
import { addDays, addMonths, diffDays, eachDay, isValidYmd, monthEnd, monthRange, monthsBetween, todayIn, weekRange, weekStart, weekdayIndex } from '../shared/dates';

describe('sanalar', () => {
  it('haftani Dushanba–Yakshanba qilib aniqlaydi', () => {
    // 2026-10-27 — seshanba
    expect(weekdayIndex('2026-10-27')).toBe(1);
    expect(weekRange('2026-10-27')).toEqual({ from: '2026-10-26', to: '2026-11-01' });
    // Yakshanba o'z haftasining oxirgi kuni
    expect(weekRange('2026-11-01')).toEqual({ from: '2026-10-26', to: '2026-11-01' });
    // Dushanba o'z haftasining birinchi kuni
    expect(weekStart('2026-10-26')).toBe('2026-10-26');
  });

  it('hafta oy chegarasidan o‘tganda to‘g‘ri ishlaydi', () => {
    const w = weekRange('2026-10-29');
    expect(w).toEqual({ from: '2026-10-26', to: '2026-11-01' });
    expect(eachDay(w.from, w.to)).toHaveLength(7);
    expect(eachDay(w.from, w.to)).toContain('2026-10-31');
    expect(eachDay(w.from, w.to)).toContain('2026-11-01');
  });

  it('hafta yil chegarasidan o‘tganda to‘g‘ri ishlaydi', () => {
    expect(weekRange('2026-12-31')).toEqual({ from: '2026-12-28', to: '2027-01-03' });
  });

  it('oy chegaralari, kabisa yili', () => {
    expect(monthRange('2028-02-10')).toEqual({ from: '2028-02-01', to: '2028-02-29' });
    expect(monthEnd('2026-02-10')).toBe('2026-02-28');
    expect(addMonths('2026-11-15', 2)).toBe('2027-01-01');
    expect(addMonths('2026-01-31', -1)).toBe('2025-12-01');
  });

  it('kun arifmetikasi', () => {
    expect(addDays('2026-02-28', 1)).toBe('2026-03-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
    expect(diffDays('2026-10-01', '2026-10-31')).toBe(30);
  });

  it('noto‘g‘ri sanalarni rad etadi', () => {
    expect(isValidYmd('2026-02-30')).toBe(false);
    expect(isValidYmd('2026-13-01')).toBe(false);
    expect(isValidYmd('2026-1-01')).toBe(false);
    expect(isValidYmd('abc')).toBe(false);
    expect(isValidYmd('2026-10-27')).toBe(true);
  });

  it('vaqt mintaqasi: Toshkent (UTC+5) sana chegarasi', () => {
    // 2026-10-27 20:30 UTC = Toshkentda 2026-10-28 01:30
    expect(todayIn('Asia/Tashkent', new Date('2026-10-27T20:30:00Z'))).toBe('2026-10-28');
    expect(todayIn('Asia/Tashkent', new Date('2026-10-27T18:59:00Z'))).toBe('2026-10-27');
    expect(todayIn('UTC', new Date('2026-10-27T20:30:00Z'))).toBe('2026-10-27');
  });

  it('oylar farqi', () => {
    expect(monthsBetween('2024-10-27', '2026-10-27')).toBe(24);
    expect(monthsBetween('2024-10-28', '2026-10-27')).toBe(23);
    expect(monthsBetween('2026-10-27', '2026-10-01')).toBe(0);
  });
});
