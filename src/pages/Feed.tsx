import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQueries, useQuery } from '@tanstack/react-query';
import { Download, ListChecks, Pencil, Plus, Trash2, Wheat } from 'lucide-react';
import { api } from '../lib/api';
import { useApp, useMut } from '../lib/app';
import { useAnimalOptions, useFilters, useList, useSort } from '../lib/hooks';
import { downloadCsv } from '../lib/csv';
import { feedTypeSchema, feedUpdateSchema, rationCreateSchema } from '../../shared/schemas';
import { formatDateShort, formatDateUz, monthRange, weekRange } from '../../shared/dates';
import { formatKg, formatNumber } from '../../shared/format';
import { round2 } from '../../shared/calc';
import type { FeedByType, FeedRecord, FeedType, Paged } from '../../shared/types';
import { SimpleBar } from '../components/charts';
import { Button, Card, ConfirmDialog, EmptyState, ErrorState, Field, FormError, IconButton, Loading, Modal, PageHeader, Pagination, SortTh, StatCard } from '../components/ui';
import { AnimalSelect, DateRange, FilterBar, SearchInput, animalLabel } from '../components/filters';
import type { ZodIssue } from 'zod';

type FeedList = Paged<FeedRecord> & { sumKg: number; sumCost: number; perAnimal: { animalId: number; animalName: string; animalTag: string; kg: number; cost: number }[]; perType: FeedByType[] };
interface Defaults { date: string; price: number; rows: { animalId: number; animalName: string; animalTag: string; defaultKg: number; alreadyRecorded: boolean }[] }

const FEED_TYPES = ['Pichan', 'Omixta yem', 'Silos', 'Kunjara', 'Beda', 'Arpa', 'Makkajo‘xori', 'Kepak'];
const num = (v: string) => { const n = Number(v.replace(',', '.').replace(/\s/g, '')); return Number.isFinite(n) ? n : 0; };
const fmtInput = (n: number) => (n ? String(n).replace('.', ',') : '');
function issueMap(issues: ZodIssue[]) {
  const m: Record<string, string> = {};
  for (const i of issues) { const k = i.path.join('.'); if (!m[k]) m[k] = i.message; }
  return m;
}

interface Line { key: number; feedType: string; kg: string; price: string; priceTouched: boolean }
let lineKey = 1;
const newLine = (over: Partial<Line> = {}): Line => ({ key: lineKey++, feedType: '', kg: '', price: '', priceTouched: false, ...over });

function FeedCreateModal({ open, onClose, defaultAnimalId }: { open: boolean; onClose: () => void; defaultAnimalId?: string }) {
  const { today, money, settings } = useApp();
  const [date, setDate] = useState(today);
  const [notes, setNotes] = useState('');
  const [skipExisting, setSkipExisting] = useState(true);
  const [picked, setPicked] = useState<Set<number>>(new Set());
  const [lines, setLines] = useState<Line[]>([newLine()]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState('');

  const catalog = useQuery({ queryKey: ['feed-types'], queryFn: () => api.get<FeedType[]>('/feed-types'), enabled: open });
  const defaults = useQuery({ queryKey: ['feed-defaults', date, ''], queryFn: () => api.get<Defaults>('/feed/defaults', { date, feedType: '' }), enabled: open });
  const rows = defaults.data?.rows ?? [];
  const types = catalog.data ?? [];
  const priceOf = (name: string) => types.find((t) => t.name.trim().toLowerCase() === name.trim().toLowerCase())?.pricePerKg;

  useEffect(() => {
    if (!open) return;
    setDate(today); setNotes(''); setSkipExisting(true); setErrors({}); setFormError('');
    setPicked(new Set(defaultAnimalId ? [Number(defaultAnimalId)] : []));
    setLines([newLine()]);
  }, [open, today, defaultAnimalId]);

  // Bitta mol tanlanganda (profildan ochilganda) birinchi qatorga uning standart kunlik miqdori qo'yiladi
  useEffect(() => {
    if (!open || !defaultAnimalId || !defaults.data) return;
    const a = defaults.data.rows.find((r) => String(r.animalId) === defaultAnimalId);
    if (a && a.defaultKg > 0) setLines((ls) => (ls.length === 1 && !ls[0].kg ? [{ ...ls[0], kg: fmtInput(a.defaultKg) }] : ls));
    // eslint-disable-next-line
  }, [open, defaults.data?.rows.length]);

  const save = useMut(
    (payload: unknown) => api.post<{ created: number; skipped: number }>('/feed/ration', payload),
    { success: (r) => `${r.created} ta yemish yozuvi saqlandi${r.skipped ? ` (${r.skipped} tasi allaqachon bor edi — o‘tkazib yuborildi)` : ''}`, silentError: true, onSuccess: onClose },
  );

  const setLine = (key: number, p: Partial<Line>) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...p } : l)));
  const onTypeChange = (l: Line, name: string) => {
    const p = priceOf(name);
    setLine(l.key, { feedType: name, ...(!l.priceTouched && p !== undefined ? { price: fmtInput(p) } : {}) });
  };
  const addFromCatalog = (t: FeedType) => setLines((ls) => {
    const blank = ls.length === 1 && !ls[0].feedType && !ls[0].kg && !ls[0].price;
    const nl = newLine({ feedType: t.name, price: fmtInput(t.pricePerKg) });
    return blank ? [nl] : [...ls, nl];
  });

  const lineTotal = (l: Line) => round2(num(l.kg) * num(l.price));
  const perAnimalKg = round2(lines.reduce((s, l) => s + num(l.kg), 0));
  const perAnimalCost = round2(lines.reduce((s, l) => s + lineTotal(l), 0));
  const n = picked.size;
  const allIds = rows.map((r) => r.animalId);
  const allChecked = allIds.length > 0 && allIds.every((id) => picked.has(id));

  function submit() {
    setFormError('');
    const payload = {
      recordDate: date, notes, skipExisting, animalIds: [...picked],
      lines: lines.map((l) => ({ feedType: l.feedType, quantityKg: l.kg, pricePerKg: l.price === '' ? String(settings.feedPrice) : l.price })),
    };
    const parsed = rationCreateSchema.safeParse(payload);
    if (!parsed.success) {
      const m = issueMap(parsed.error.issues);
      setErrors(m);
      setFormError(m.animalIds ?? m.lines ?? 'Iltimos, qizil bilan ko‘rsatilgan maydonlarni to‘g‘rilang.');
      return;
    }
    setErrors({});
    save.mutate(parsed.data, { onError: (e) => setFormError(e instanceof Error ? e.message : 'Xatolik') });
  }

  return (
    <Modal open={open} onClose={onClose} title="Yemish kiritish" size="xl"
      footer={<><Button variant="secondary" onClick={onClose}>Bekor qilish</Button><Button loading={save.isPending} onClick={submit}>Saqlash</Button></>}>
      <FormError message={formError} />
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Sana" required error={errors.recordDate}><input type="date" className="input" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} /></Field>
        <Field label="Izoh (ixtiyoriy)" className="sm:col-span-2" error={errors.notes}><input className="input" value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
      </div>

      <h3 className="mb-2 mt-5 text-sm font-semibold text-stone-800">1. Qaysi mollarga (har biriga alohida yoziladi)</h3>
      {defaults.isLoading ? <Loading /> : rows.length === 0 ? (
        <EmptyState title="Faol mol yo‘q" text="Avval “Mollar” bo‘limida mol qo‘shing." />
      ) : (
        <div className="overflow-hidden rounded-xl border border-stone-200">
          <label className="flex cursor-pointer items-center gap-2 bg-stone-50 px-3 py-2 text-sm font-medium">
            <input type="checkbox" className="h-4 w-4 accent-brand-600" checked={allChecked} onChange={(e) => setPicked(e.target.checked ? new Set(allIds) : new Set())} /> Hammasini tanlash
            <span className="ml-auto text-xs font-normal text-stone-500">{n} ta tanlandi</span>
          </label>
          <ul className="max-h-44 divide-y divide-stone-100 overflow-y-auto">
            {rows.map((r) => (
              <li key={r.animalId}>
                <label className="flex cursor-pointer items-center gap-3 px-3 py-2 text-sm">
                  <input type="checkbox" className="h-4 w-4 accent-brand-600" checked={picked.has(r.animalId)}
                    onChange={(e) => setPicked((c) => { const x = new Set(c); if (e.target.checked) x.add(r.animalId); else x.delete(r.animalId); return x; })} />
                  <span className="font-medium text-stone-900">{r.animalName}</span><span className="text-stone-400">({r.animalTag})</span>
                  {r.defaultKg > 0 && <span className="ml-auto text-xs text-stone-400">standart: {formatKg(r.defaultKg)}</span>}
                </label>
              </li>
            ))}
          </ul>
        </div>
      )}
      {errors.animalIds && <div className="mt-1 text-xs text-red-600">{errors.animalIds}</div>}

      <h3 className="mb-2 mt-5 text-sm font-semibold text-stone-800">2. Yem turlari: har bir molga necha kg va 1 kg narxi</h3>
      {types.length > 0 && (
        <div className="mb-2 flex flex-wrap items-center gap-2 text-xs">
          <span className="text-stone-500">Ro‘yxatdan qo‘shish:</span>
          {types.map((t) => (
            <button key={t.id} type="button" onClick={() => addFromCatalog(t)}
              className="rounded-full border border-brand-200 bg-brand-50 px-3 py-1 font-medium text-brand-800 hover:bg-brand-100">+ {t.name} <span className="text-brand-600">({formatNumber(t.pricePerKg, 0)})</span></button>
          ))}
        </div>
      )}
      <div className="space-y-2">
        <div className="hidden grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.2fr)_2rem] gap-2 px-1 text-xs font-medium text-stone-500 sm:grid">
          <span>Yem turi</span><span>Kg (har molga)</span><span>1 kg narxi</span><span className="text-right">Jami</span><span />
        </div>
        {lines.map((l, i) => {
          const e = (k: string) => errors[`lines.${i}.${k}`];
          return (
            <div key={l.key} className="grid grid-cols-2 items-start gap-2 rounded-xl border border-stone-200 p-2 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.2fr)_2rem] sm:border-0 sm:p-0">
              <div className="col-span-2 sm:col-span-1">
                <input aria-label="Yem turi" className={`input ${e('feedType') ? 'input-error' : ''}`} list="feed-types" placeholder="Masalan: Silos" value={l.feedType} onChange={(ev) => onTypeChange(l, ev.target.value)} />
                {e('feedType') && <div className="text-[11px] text-red-600">{e('feedType')}</div>}
              </div>
              <div>
                <input aria-label="Kg" inputMode="decimal" placeholder="kg" className={`input ${e('quantityKg') ? 'input-error' : ''}`} value={l.kg} onChange={(ev) => setLine(l.key, { kg: ev.target.value })} />
                {e('quantityKg') && <div className="text-[11px] text-red-600">{e('quantityKg')}</div>}
              </div>
              <div>
                <input aria-label="1 kg narxi" inputMode="decimal" placeholder="so‘m" className={`input ${e('pricePerKg') ? 'input-error' : ''}`} value={l.price} onChange={(ev) => setLine(l.key, { price: ev.target.value, priceTouched: true })} />
                {e('pricePerKg') && <div className="text-[11px] text-red-600">{e('pricePerKg')}</div>}
              </div>
              <div className="col-span-2 self-center rounded-lg bg-stone-50 px-3 py-2 text-right text-sm sm:col-span-1">
                <span className="text-xs text-stone-500 sm:hidden">Jami: </span>
                <b className="text-stone-900">{money(lineTotal(l))}</b>
                {num(l.kg) > 0 && num(l.price) > 0 && <div className="text-[11px] text-stone-400">{formatNumber(num(l.kg), 2)} kg × {formatNumber(num(l.price), 0)}</div>}
              </div>
              <div className="col-span-2 sm:col-span-1">
                <IconButton label="Qatorni olib tashlash" disabled={lines.length === 1} onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))}><Trash2 className="h-4 w-4" /></IconButton>
              </div>
            </div>
          );
        })}
      </div>
      {errors.lines && <div className="mt-1 text-xs text-red-600">{errors.lines}</div>}
      <datalist id="feed-types">{[...new Set([...types.map((t) => t.name), ...FEED_TYPES])].map((t) => <option key={t} value={t} />)}</datalist>
      <Button className="mt-3" size="sm" variant="secondary" icon={<Plus className="h-4 w-4" />} onClick={() => setLines((ls) => [...ls, newLine()])}>Yem turi qo‘shish</Button>

      <label className="mt-4 flex cursor-pointer items-center gap-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
        <input type="checkbox" className="h-4 w-4 accent-brand-600" checked={skipExisting} onChange={(e) => setSkipExisting(e.target.checked)} />
        Shu kun va yem turida yozuvi bor mollarni o‘tkazib yuborish (ikki marta hisoblanmaydi)
      </label>

      <div className="mt-4 grid grid-cols-1 gap-3 rounded-xl bg-brand-50 px-4 py-3 text-sm sm:grid-cols-3">
        <div><div className="text-brand-800">Bitta molga</div><div className="text-lg font-bold text-brand-700">{formatKg(perAnimalKg)} · {money(perAnimalCost)}</div></div>
        <div><div className="text-brand-800">Jami miqdor ({n} ta mol)</div><div className="text-lg font-bold text-brand-700">{formatKg(round2(perAnimalKg * n))}</div></div>
        <div><div className="text-brand-800">Jami xarajat</div><div className="text-lg font-bold text-brand-700">{money(round2(perAnimalCost * n))}</div></div>
      </div>
    </Modal>
  );
}

function FeedTypeRow({ t }: { t: FeedType }) {
  const [name, setName] = useState(t.name);
  const [price, setPrice] = useState(fmtInput(t.pricePerKg));
  const [err, setErr] = useState('');
  const [del, setDel] = useState(false);
  const save = useMut((p: unknown) => api.put(`/feed-types/${t.id}`, p), { success: 'Yem turi yangilandi — eski yozuvlar o‘zgarmadi', silentError: true });
  const remove = useMut(() => api.del(`/feed-types/${t.id}`), { success: 'Yem turi ro‘yxatdan olib tashlandi (eski yozuvlar saqlanadi)', onSuccess: () => setDel(false) });
  const dirty = name.trim() !== t.name || num(price) !== t.pricePerKg;
  const submit = () => {
    const p = feedTypeSchema.safeParse({ name, pricePerKg: price });
    if (!p.success) { setErr(p.error.issues[0].message); return; }
    setErr(''); save.mutate(p.data, { onError: (e) => setErr(e instanceof Error ? e.message : 'Xatolik') });
  };
  return (
    <li className="py-2">
      <div className="flex flex-wrap items-center gap-2">
        <input aria-label="Yem turi nomi" className="input min-w-[8rem] flex-1" value={name} onChange={(e) => setName(e.target.value)} />
        <input aria-label="1 kg narxi" inputMode="decimal" className="input w-28 text-right" value={price} onChange={(e) => setPrice(e.target.value)} />
        <span className="text-xs text-stone-500">so‘m/kg</span>
        <Button size="sm" disabled={!dirty} loading={save.isPending} onClick={submit}>Saqlash</Button>
        <IconButton label="Ro‘yxatdan olib tashlash" className="hover:!bg-red-50 hover:!text-red-600" onClick={() => setDel(true)}><Trash2 className="h-4 w-4" /></IconButton>
      </div>
      {err && <div className="mt-1 text-xs text-red-600">{err}</div>}
      <ConfirmDialog open={del} title="Yem turini olib tashlash" loading={remove.isPending}
        message={<><b>{t.name}</b> yem turini ro‘yxatdan olib tashlamoqchimisiz? Oldingi yemish yozuvlari va hisobotlar o‘zgarmaydi.</>}
        onCancel={() => setDel(false)} onConfirm={() => remove.mutate(undefined as never)} />
    </li>
  );
}

function FeedTypesModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const q = useQuery({ queryKey: ['feed-types'], queryFn: () => api.get<FeedType[]>('/feed-types'), enabled: open });
  const [name, setName] = useState('');
  const [price, setPrice] = useState('');
  const [err, setErr] = useState('');
  const add = useMut((p: unknown) => api.post('/feed-types', p), { success: 'Yem turi qo‘shildi', silentError: true, onSuccess: () => { setName(''); setPrice(''); } });
  const submit = () => {
    const p = feedTypeSchema.safeParse({ name, pricePerKg: price });
    if (!p.success) { setErr(p.error.issues[0].message); return; }
    setErr(''); add.mutate(p.data, { onError: (e) => setErr(e instanceof Error ? e.message : 'Xatolik') });
  };
  return (
    <Modal open={open} onClose={onClose} title="Yem turlari va narxlari" size="lg" footer={<Button variant="secondary" onClick={onClose}>Yopish</Button>}>
      <p className="mb-3 text-sm text-stone-600">Har bir yem turi uchun 1 kg narxini yozib qo‘ying: yemish kiritganda narx o‘zi chiqadi (kerak bo‘lsa o‘zgartirasiz). Bu yerda narxni o‘zgartirsangiz, <b>eski yozuvlar va hisobotlar o‘zgarmaydi</b>.</p>
      <div className="rounded-xl border border-brand-200 bg-brand-50/50 p-3">
        <div className="text-xs font-semibold text-brand-800">Yangi yem turi</div>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <input aria-label="Yangi yem turi nomi" className="input min-w-[8rem] flex-1" placeholder="Masalan: Silos" value={name} onChange={(e) => setName(e.target.value)} />
          <input aria-label="Yangi yem 1 kg narxi" inputMode="decimal" className="input w-28 text-right" placeholder="500" value={price} onChange={(e) => setPrice(e.target.value)} />
          <span className="text-xs text-stone-500">so‘m/kg</span>
          <Button size="sm" icon={<Plus className="h-4 w-4" />} loading={add.isPending} onClick={submit}>Qo‘shish</Button>
        </div>
        {err && <div className="mt-1 text-xs text-red-600">{err}</div>}
      </div>
      <div className="mt-4">
        {q.isLoading ? <Loading /> : (q.data ?? []).length === 0 ? (
          <p className="py-4 text-center text-sm text-stone-500">Hali yem turi qo‘shilmagan. Yuqorida birinchisini qo‘shing (masalan, Silos — 500 so‘m).</p>
        ) : <ul className="divide-y divide-stone-100">{(q.data ?? []).map((t) => <FeedTypeRow key={`${t.id}-${t.name}-${t.pricePerKg}`} t={t} />)}</ul>}
      </div>
    </Modal>
  );
}

function FeedEditModal({ record, onClose }: { record: FeedRecord | null; onClose: () => void }) {
  const { money } = useApp();
  const [v, setV] = useState({ recordDate: '', feedType: '', quantityKg: '', pricePerKg: '', notes: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState('');
  useEffect(() => {
    if (record) { setV({ recordDate: record.recordDate, feedType: record.feedType, quantityKg: fmtInput(record.quantityKg), pricePerKg: fmtInput(record.pricePerKg), notes: record.notes ?? '' }); setErrors({}); setFormError(''); }
  }, [record]);
  const save = useMut((p: unknown) => api.put<FeedRecord>(`/feed/${record!.id}`, p), { success: 'Yemish yozuvi yangilandi', silentError: true, onSuccess: onClose });
  const submit = () => {
    const parsed = feedUpdateSchema.safeParse(v);
    if (!parsed.success) { setErrors(issueMap(parsed.error.issues)); setFormError('Iltimos, qizil bilan ko‘rsatilgan maydonlarni to‘g‘rilang.'); return; }
    setErrors({}); setFormError('');
    save.mutate(parsed.data, { onError: (e) => setFormError(e instanceof Error ? e.message : 'Xatolik') });
  };
  const set = (k: keyof typeof v) => (e: { target: { value: string } }) => setV((x) => ({ ...x, [k]: e.target.value }));
  return (
    <Modal open={!!record} onClose={onClose} title="Yemish yozuvini tahrirlash"
      footer={<><Button variant="secondary" onClick={onClose}>Bekor qilish</Button><Button loading={save.isPending} onClick={submit}>Saqlash</Button></>}>
      <FormError message={formError} />
      <p className="mb-3 text-sm text-stone-600">Mol: <b>{record?.animalName}</b> ({record?.animalTag})</p>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Sana" required error={errors.recordDate}><input type="date" className="input" value={v.recordDate} onChange={set('recordDate')} /></Field>
        <Field label="Yem turi" error={errors.feedType}><input className="input" list="feed-types-edit" value={v.feedType} onChange={set('feedType')} /><datalist id="feed-types-edit">{FEED_TYPES.map((t) => <option key={t} value={t} />)}</datalist></Field>
        <Field label="Haqiqiy sarf (kg)" required error={errors.quantityKg}><input inputMode="decimal" className={`input ${errors.quantityKg ? 'input-error' : ''}`} value={v.quantityKg} onChange={set('quantityKg')} /></Field>
        <Field label="1 kg narxi (so‘m)" required error={errors.pricePerKg} hint="Bu yozuvdagi narx; boshqa yozuvlarga ta’sir qilmaydi"><input inputMode="decimal" className={`input ${errors.pricePerKg ? 'input-error' : ''}`} value={v.pricePerKg} onChange={set('pricePerKg')} /></Field>
        <Field label="Izoh" className="sm:col-span-2" error={errors.notes}><textarea rows={2} className="input" value={v.notes} onChange={set('notes')} /></Field>
        <div className="rounded-xl bg-brand-50 px-4 py-3 text-sm sm:col-span-2">Jami xarajat: <b className="text-brand-700">{money(round2(num(v.quantityKg) * num(v.pricePerKg)))}</b></div>
      </div>
    </Modal>
  );
}

export function Feed() {
  const { today, money, settings } = useApp();
  const [params, setParams] = useSearchParams();
  const animals = useAnimalOptions();
  const mo = monthRange(today), wk = weekRange(today);
  const { filters, patch, page, setPage } = useFilters({ from: mo.from, to: today, animalId: params.get('animalId') ?? '', search: '' });
  const { sort, dir, onSort } = useSort('date', 'desc');
  const [createOpen, setCreateOpen] = useState(false);
  const [typesOpen, setTypesOpen] = useState(false);
  const [editing, setEditing] = useState<FeedRecord | null>(null);
  const [deleting, setDeleting] = useState<FeedRecord | null>(null);

  useEffect(() => { if (params.get('new') === '1') { setCreateOpen(true); setParams((p) => { p.delete('new'); return p; }, { replace: true }); } }, [params, setParams]);

  const q = useList<FeedList>('feed', '/feed', { ...filters, sort, dir, page, pageSize: 15 });
  const periods = useQueries({
    queries: [{ k: 'Bugun', f: today, t: today }, { k: 'Shu hafta', f: wk.from, t: wk.to }, { k: 'Shu oy', f: mo.from, t: mo.to }].map((p) => ({
      queryKey: ['feed', 'period', p.f, p.t], queryFn: () => api.get<FeedList>('/feed', { from: p.f, to: p.t, pageSize: 1 }),
    })),
  });
  const remove = useMut((id: number) => api.del(`/feed/${id}`), { success: 'Yemish yozuvi o‘chirildi', onSuccess: () => setDeleting(null) });
  const d = q.data;
  const periodNames = ['Bugun', 'Shu hafta (Du–Ya)', 'Shu oy'];

  async function exportCsv() {
    const all = await api.get<FeedList>('/feed', { ...filters, sort, dir, pageSize: 'all' });
    downloadCsv(`yemish-yozuvlari_${filters.from}_${filters.to}`, ['Sana', 'Mol raqami', 'Mol nomi', 'Yem turi', 'Miqdor (kg)', '1 kg narxi', 'Jami xarajat', 'Izoh'],
      all.rows.map((r) => [r.recordDate, r.animalTag, r.animalName, r.feedType, r.quantityKg, r.pricePerKg, r.totalCost, r.notes]));
  }

  const perAnimalSorted = useMemo(() => d?.perAnimal ?? [], [d]);

  return (
    <>
      <PageHeader title="Yemish hisobi" subtitle="Haqiqiy sarflangan yemish va uning narxi — yozuv sanasidagi narx bilan saqlanadi"
        actions={<div className="flex flex-wrap gap-2"><Button variant="secondary" icon={<ListChecks className="h-4 w-4" />} onClick={() => setTypesOpen(true)}>Yem turlari va narxlari</Button><Button icon={<Plus className="h-4 w-4" />} onClick={() => setCreateOpen(true)}>Yemish kiritish</Button></div>} />

      <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
        {periods.map((p, i) => (
          <StatCard key={i} label={`Yemish sarfi — ${periodNames[i]}`} value={formatKg(p.data?.sumKg ?? 0)} tone="amber" icon={<Wheat className="h-5 w-5" />} hint={money(p.data?.sumCost ?? 0)} />
        ))}
      </div>

      <FilterBar>
        <DateRange from={filters.from} to={filters.to} today={today} onChange={(r) => patch(r)} />
        <label className="min-w-[12rem] flex-1 text-xs font-medium text-stone-500 sm:flex-none">Mol
          <AnimalSelect className="mt-0.5" value={filters.animalId} onChange={(v) => patch({ animalId: v })} animals={animals.data ?? []} />
        </label>
        <SearchInput className="min-w-[10rem] flex-1" value={filters.search} onChange={(v) => patch({ search: v })} placeholder="Mol yoki yem turi" />
        <Button variant="secondary" icon={<Download className="h-4 w-4" />} onClick={exportCsv}>CSV</Button>
      </FilterBar>

      {d && d.total > 0 && (
        <div className="mb-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
          <div className="grid grid-cols-2 gap-3 lg:col-span-1 lg:grid-cols-1">
            <StatCard label="Tanlangan davrdagi sarf" value={formatKg(d.sumKg)} tone="amber" icon={<Wheat className="h-5 w-5" />} hint={`${d.total} ta yozuv`} />
            <StatCard label="Tanlangan davrdagi xarajat" value={money(d.sumCost)} tone="amber" hint={d.sumKg ? `o‘rtacha ${money(d.sumCost / d.sumKg)} / kg` : undefined} />
          </div>
          <Card title="Mollar bo‘yicha yemish" className="lg:col-span-2" padded={false}>
            <div className="max-h-56 overflow-y-auto"><table className="w-full">
              <thead className="sticky top-0 bg-stone-50"><tr><th className="th">Mol</th><th className="th text-right">Sarf</th><th className="th text-right">Xarajat</th></tr></thead>
              <tbody className="divide-y divide-stone-100">{perAnimalSorted.map((p) => (
                <tr key={p.animalId}><td className="td font-medium">{p.animalName} <span className="text-stone-400">({p.animalTag})</span></td><td className="td text-right">{formatKg(p.kg)}</td><td className="td text-right font-semibold">{money(p.cost)}</td></tr>
              ))}</tbody></table></div>
          </Card>
        </div>
      )}

      {d && d.perType.length > 0 && (
        <Card title="Yem turlari bo‘yicha (tanlangan davr)" className="mb-4" padded={false}>
          <div className="grid grid-cols-1 gap-4 p-4 lg:grid-cols-2">
            <div className="overflow-x-auto"><table className="w-full min-w-[22rem]">
              <thead className="bg-stone-50"><tr><th className="th">Yem turi</th><th className="th text-right">Miqdor</th><th className="th text-right">O‘rtacha narx</th><th className="th text-right">Xarajat</th></tr></thead>
              <tbody className="divide-y divide-stone-100">{d.perType.map((t) => (
                <tr key={t.feedType || '—'}><td className="td font-medium">{t.feedType || 'Turi ko‘rsatilmagan'}</td><td className="td text-right">{formatKg(t.kg)}</td><td className="td text-right">{formatNumber(t.avgPrice, 0)}</td><td className="td text-right font-semibold">{money(t.cost)}</td></tr>
              ))}</tbody>
              <tfoot><tr className="border-t border-stone-200 bg-stone-50 font-semibold"><td className="td">Jami</td><td className="td text-right">{formatKg(d.sumKg)}</td><td className="td" /><td className="td text-right">{money(d.sumCost)}</td></tr></tfoot>
            </table></div>
            <div>
              <div className="mb-1 text-xs font-medium text-stone-500">Xarajat yem turlari bo‘yicha ({settings.currencyLabel})</div>
              <SimpleBar layout="horizontal" unit={settings.currencyLabel} data={d.perType.map((t) => ({ label: t.feedType || 'Ko‘rsatilmagan', value: t.cost }))} valueFormat={(n) => money(n)} color="#d97706" />
            </div>
          </div>
        </Card>
      )}

      <Card padded={false}>
        {q.isLoading ? <Loading /> : q.error ? <ErrorState error={q.error} onRetry={() => q.refetch()} /> : !d || d.rows.length === 0 ? (
          <EmptyState icon={<Wheat className="h-6 w-6" />} title="Yemish yozuvlari topilmadi" text="Tanlangan davr yoki filtrda yozuv yo‘q." action={<Button icon={<Plus className="h-4 w-4" />} onClick={() => setCreateOpen(true)}>Yemish kiritish</Button>} />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[36rem]">
                <thead className="border-b border-stone-100 bg-stone-50/60"><tr>
                  <SortTh label="Sana" field="date" sort={sort} dir={dir} onSort={onSort} />
                  <SortTh label="Mol" field="animal" sort={sort} dir={dir} onSort={onSort} />
                  <th className="th hidden sm:table-cell">Yem turi</th>
                  <SortTh label="Miqdor" field="quantity" sort={sort} dir={dir} onSort={onSort} className="text-right" />
                  <th className="th hidden text-right md:table-cell">1 kg narxi</th>
                  <SortTh label="Xarajat" field="cost" sort={sort} dir={dir} onSort={onSort} className="text-right" />
                  <th className="th text-right">Amallar</th>
                </tr></thead>
                <tbody className="divide-y divide-stone-100">
                  {d.rows.map((r) => (
                    <tr key={r.id} className="hover:bg-stone-50/70">
                      <td className="td whitespace-nowrap">{formatDateShort(r.recordDate)}</td>
                      <td className="td font-medium text-stone-900">{r.animalName} <span className="text-stone-400">({r.animalTag})</span></td>
                      <td className="td hidden sm:table-cell">{r.feedType || '—'}{r.batchId && <span className="ml-1 text-[11px] text-stone-400">guruh</span>}</td>
                      <td className="td text-right">{formatKg(r.quantityKg)}</td>
                      <td className="td hidden text-right md:table-cell">{formatNumber(r.pricePerKg, 0)}</td>
                      <td className="td text-right font-bold text-stone-900">{money(r.totalCost)}</td>
                      <td className="td"><div className="flex justify-end">
                        <IconButton label="Tahrirlash" onClick={() => setEditing(r)}><Pencil className="h-4 w-4" /></IconButton>
                        <IconButton label="O‘chirish" className="hover:!bg-red-50 hover:!text-red-600" onClick={() => setDeleting(r)}><Trash2 className="h-4 w-4" /></IconButton>
                      </div></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination page={d.page} totalPages={d.totalPages} total={d.total} pageSize={d.pageSize} onPage={setPage} />
          </>
        )}
      </Card>

      <FeedCreateModal open={createOpen} onClose={() => setCreateOpen(false)} defaultAnimalId={filters.animalId || undefined} />
      <FeedTypesModal open={typesOpen} onClose={() => setTypesOpen(false)} />
      <FeedEditModal record={editing} onClose={() => setEditing(null)} />
      <ConfirmDialog open={!!deleting} title="Yemish yozuvini o‘chirish" loading={remove.isPending}
        message={deleting && <>{formatDateUz(deleting.recordDate)} sanadagi <b>{deleting.animalName}</b> uchun {formatKg(deleting.quantityKg)} yemish yozuvini o‘chirmoqchimisiz?</>}
        onCancel={() => setDeleting(null)} onConfirm={() => deleting && remove.mutate(deleting.id)} />
    </>
  );
}
