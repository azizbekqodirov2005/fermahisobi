import { useEffect, useState, type ReactNode } from 'react';
import clsx from 'clsx';
import { ChevronLeft, ChevronRight, Search, X } from 'lucide-react';
import { addDays, addMonths, formatMonthYear, formatRangeUz, monthRange, weekRange } from '../../shared/dates';
import { useDebounced } from '../lib/hooks';
import { IconButton } from './ui';
import type { Animal } from '../../shared/types';

export const animalLabel = (a: { tagNumber?: string; tag?: string; name: string }) => `${a.name} (${a.tagNumber ?? a.tag})`;

export function SearchInput({ value, onChange, placeholder = 'Qidirish…', className }: { value: string; onChange: (v: string) => void; placeholder?: string; className?: string }) {
  const [local, setLocal] = useState(value);
  const debounced = useDebounced(local, 300);
  useEffect(() => { if (debounced !== value) onChange(debounced); /* eslint-disable-next-line */ }, [debounced]);
  useEffect(() => { setLocal(value); }, [value]);
  return (
    <div className={clsx('relative', className)}>
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
      <input className="input pl-9 pr-9" value={local} onChange={(e) => setLocal(e.target.value)} placeholder={placeholder} aria-label={placeholder} />
      {local && <button type="button" aria-label="Tozalash" onClick={() => { setLocal(''); onChange(''); }} className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-stone-400 hover:text-stone-700"><X className="h-4 w-4" /></button>}
    </div>
  );
}

export function AnimalSelect({ value, onChange, animals, allLabel = 'Barcha mollar', className, id }: { value: string; onChange: (v: string) => void; animals: Pick<Animal, 'id' | 'name' | 'tagNumber' | 'status'>[]; allLabel?: string; className?: string; id?: string }) {
  return (
    <select id={id} className={clsx('input', className)} value={value} onChange={(e) => onChange(e.target.value)} aria-label="Mol tanlash">
      <option value="">{allLabel}</option>
      {animals.map((a) => <option key={a.id} value={a.id}>{animalLabel(a)}{a.status === 'inactive' ? ' — nofaol' : ''}</option>)}
    </select>
  );
}

const chip = 'rounded-full border px-3 py-1.5 text-xs font-semibold transition';

export function DateRange({ from, to, today, onChange, presets = true }: { from: string; to: string; today: string; onChange: (r: { from: string; to: string }) => void; presets?: boolean }) {
  const wk = weekRange(today), mo = monthRange(today);
  const items = [
    { label: 'Bugun', from: today, to: today },
    { label: 'Shu hafta', from: wk.from, to: wk.to },
    { label: 'Shu oy', from: mo.from, to: mo.to },
    { label: 'Oxirgi 30 kun', from: addDays(today, -29), to: today },
  ];
  return (
    <div className="flex flex-wrap items-end gap-2">
      <label className="text-xs font-medium text-stone-500">Dan
        <input type="date" className="input mt-0.5 w-[9.5rem]" value={from} max={to || undefined} onChange={(e) => e.target.value && onChange({ from: e.target.value, to })} />
      </label>
      <label className="text-xs font-medium text-stone-500">Gacha
        <input type="date" className="input mt-0.5 w-[9.5rem]" value={to} min={from || undefined} onChange={(e) => e.target.value && onChange({ from, to: e.target.value })} />
      </label>
      {presets && (
        <div className="flex flex-wrap gap-1.5 pb-0.5">
          {items.map((p) => {
            const active = p.from === from && p.to === to;
            return <button key={p.label} type="button" onClick={() => onChange({ from: p.from, to: p.to })}
              className={clsx(chip, active ? 'border-brand-600 bg-brand-600 text-white' : 'border-stone-300 bg-white text-stone-600 hover:bg-stone-50')}>{p.label}</button>;
          })}
        </div>
      )}
    </div>
  );
}

export type PeriodMode = 'week' | 'month' | 'range';

/** Hafta (Du–Ya) / oy / ixtiyoriy oraliq; oldingi–keyingi davrga o'tish tugmalari bilan. */
export function PeriodPicker({ mode, from, to, today, onChange }: { mode: PeriodMode; from: string; to: string; today: string; onChange: (p: { mode: PeriodMode; from: string; to: string }) => void }) {
  const setMode = (m: PeriodMode) => {
    if (m === 'week') { const r = weekRange(from <= today && to >= today ? today : from); onChange({ mode: m, ...r }); }
    else if (m === 'month') { const r = monthRange(from <= today && to >= today ? today : from); onChange({ mode: m, ...r }); }
    else onChange({ mode: m, from, to });
  };
  const shift = (dir: -1 | 1) => {
    if (mode === 'week') onChange({ mode, ...weekRange(addDays(from, 7 * dir)) });
    else if (mode === 'month') onChange({ mode, ...monthRange(addMonths(from, dir)) });
  };
  const label = mode === 'month' ? formatMonthYear(from) : formatRangeUz(from, to);
  const isCurrent = mode !== 'range' && from <= today && to >= today;
  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="inline-flex rounded-xl bg-stone-200/60 p-1">
        {([['week', 'Hafta'], ['month', 'Oy'], ['range', 'Oraliq']] as [PeriodMode, string][]).map(([m, l]) => (
          <button key={m} type="button" onClick={() => setMode(m)}
            className={clsx('rounded-lg px-3.5 py-1.5 text-sm font-semibold transition', mode === m ? 'bg-white text-brand-700 shadow-sm' : 'text-stone-600 hover:text-stone-900')}>{l}</button>
        ))}
      </div>
      {mode !== 'range' ? (
        <div className="flex items-center gap-1 rounded-xl border border-stone-200 bg-white p-1">
          <IconButton label="Oldingi davr" onClick={() => shift(-1)}><ChevronLeft className="h-5 w-5" /></IconButton>
          <span className="min-w-[10rem] px-1 text-center text-sm font-semibold text-stone-800 sm:min-w-[15rem]">{label}</span>
          <IconButton label="Keyingi davr" onClick={() => shift(1)}><ChevronRight className="h-5 w-5" /></IconButton>
          {!isCurrent && (
            <button type="button" className="mr-1 rounded-lg px-2 py-1 text-xs font-semibold text-brand-700 hover:bg-brand-50"
              onClick={() => onChange({ mode, ...(mode === 'week' ? weekRange(today) : monthRange(today)) })}>Hozirgi</button>
          )}
        </div>
      ) : (
        <DateRange from={from} to={to} today={today} onChange={(r) => onChange({ mode, ...r })} />
      )}
    </div>
  );
}

export function FilterBar({ children }: { children: ReactNode }) {
  return <div className="mb-4 flex flex-wrap items-end gap-3 rounded-2xl border border-stone-200/80 bg-white p-3 shadow-card sm:p-4">{children}</div>;
}
