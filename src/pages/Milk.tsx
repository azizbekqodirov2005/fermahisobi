import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import type { z } from 'zod';
import { useQuery } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight, Download, Milk as MilkIcon, Pencil, Plus, Save, Tag, Trash2 } from 'lucide-react';
import { api } from '../lib/api';
import { applyApiError, useApp, useMut } from '../lib/app';
import { useAnimalOptions, useFilters, useList, useSort } from '../lib/hooks';
import { downloadCsv } from '../lib/csv';
import { milkSchema, priceSchema, qty } from '../../shared/schemas';
import { addDays, formatDateShort, formatDateUz, monthRange } from '../../shared/dates';
import { dailyTotal } from '../../shared/calc';
import { formatLiters, formatNumber } from '../../shared/format';
import type { MilkRecord, Paged } from '../../shared/types';
import { Button, Card, ConfirmDialog, EmptyState, ErrorState, Field, FormError, IconButton, Loading, Modal, PageHeader, Pagination, SortTh, StatCard, Tabs } from '../components/ui';
import { AnimalSelect, DateRange, FilterBar, SearchInput, animalLabel } from '../components/filters';

type MilkList = Paged<MilkRecord> & { sumLiters: number; perAnimal: { animalId: number; animalName: string; animalTag: string; liters: number; days: number }[] };
type FormIn = z.input<typeof milkSchema>;

const num = (v: unknown) => { const n = Number(String(v ?? '').replace(',', '.').replace(/\s/g, '')); return Number.isFinite(n) ? n : 0; };

function MilkPriceModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { settings, today } = useApp();
  const [price, setPrice] = useState('');
  const [date, setDate] = useState(today);
  const [err, setErr] = useState('');
  useEffect(() => { if (open) { setPrice(String(settings.milkPrice || '').replace('.', ',')); setDate(today); setErr(''); } }, [open, settings.milkPrice, today]);
  const save = useMut((p: unknown) => api.post('/prices', p), { success: 'Sut narxi saqlandi — eski yozuvlar o‘zgarmadi', silentError: true, onSuccess: onClose });
  const submit = () => {
    const p = priceSchema.safeParse({ kind: 'milk', price, effectiveFrom: date });
    if (!p.success) { setErr(p.error.issues[0].message); return; }
    setErr(''); save.mutate(p.data, { onError: (e) => setErr(e instanceof Error ? e.message : 'Xatolik') });
  };
  return (
    <Modal open={open} onClose={onClose} title="Sut narxini yozish" size="sm"
      footer={<><Button variant="secondary" onClick={onClose}>Bekor qilish</Button><Button loading={save.isPending} onClick={submit}>Saqlash</Button></>}>
      <FormError message={err} />
      <div className="grid gap-4">
        <Field label="1 litr sut narxi (so‘m)" required><input inputMode="decimal" autoFocus className="input" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="Masalan: 5000" /></Field>
        <Field label="Qaysi sanadan boshlab amal qiladi" required hint="Eski sanalardagi hisobotlar o‘zgarmaydi"><input type="date" className="input" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} /></Field>
      </div>
    </Modal>
  );
}

export function MilkFormModal({ open, onClose, record, defaultAnimalId, defaultDate }: { open: boolean; onClose: () => void; record?: MilkRecord | null; defaultAnimalId?: string; defaultDate?: string }) {
  const { today, money, settings } = useApp();
  const animals = useAnimalOptions();
  const [current, setCurrent] = useState<MilkRecord | null>(null);
  const [formError, setFormError] = useState('');
  const [dupInfo, setDupInfo] = useState<MilkRecord | null>(null);
  const { register, handleSubmit, reset, setError, control, formState: { errors } } = useForm<FormIn, unknown, z.output<typeof milkSchema>>({ resolver: zodResolver(milkSchema) });

  const fill = (r: MilkRecord | null) => reset(r
    ? { animalId: String(r.animalId), recordDate: r.recordDate, morningL: String(r.morningL || ''), eveningL: String(r.eveningL || ''), extraL: String(r.extraL || ''), notes: r.notes ?? '' }
    : { animalId: defaultAnimalId ?? '', recordDate: defaultDate ?? today, morningL: '', eveningL: '', extraL: '', notes: '' });

  useEffect(() => { if (open) { setCurrent(record ?? null); setFormError(''); setDupInfo(null); fill(record ?? null); } /* eslint-disable-next-line */ }, [open, record]);

  const [m, e, x] = useWatch({ control, name: ['morningL', 'eveningL', 'extraL'] });
  const total = dailyTotal(num(m), num(e), num(x));

  const save = useMut(
    (v: z.output<typeof milkSchema>) => (current ? api.put<MilkRecord>(`/milk/${current.id}`, v) : api.post<MilkRecord>('/milk', v)),
    { success: current ? 'Sut yozuvi yangilandi' : 'Sut yozuvi saqlandi', silentError: true, onSuccess: onClose },
  );

  const submit = handleSubmit((v) => {
    setFormError(''); setDupInfo(null);
    save.mutate(v, {
      onError: async (err) => {
        if (!current && (err as { status?: number }).status === 409 && /sut yozuvi/i.test(err.message)) {
          // Takroriy yozuv: mavjudini topib, tahrirlashni taklif qilamiz
          const found = await api.get<MilkList>('/milk', { animalId: v.animalId, from: v.recordDate, to: v.recordDate }).catch(() => null);
          if (found?.rows[0]) { setDupInfo(found.rows[0]); return; }
        }
        if (!applyApiError(err, setError)) setFormError(err instanceof Error ? err.message : 'Xatolik');
        else setFormError(err instanceof Error ? err.message : '');
      },
    });
  }, () => setFormError('Iltimos, qizil bilan ko‘rsatilgan maydonlarni to‘g‘rilang.'));

  const err = (k: keyof FormIn) => errors[k]?.message as string | undefined;
  const list = (animals.data ?? []).filter((a) => a.status === 'active' || (current && a.id === current.animalId));

  return (
    <Modal open={open} onClose={onClose} title={current ? 'Sut yozuvini tahrirlash' : 'Sut kiritish'}
      footer={<>
        <Button variant="secondary" onClick={onClose}>Bekor qilish</Button>
        <Button loading={save.isPending} onClick={submit}>Saqlash</Button>
      </>}>
      <form onSubmit={submit} noValidate className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <FormError message={formError} />
          {dupInfo && (
            <div className="mb-3 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2.5 text-sm text-amber-900">
              Bu mol uchun <b>{formatDateUz(dupInfo.recordDate)}</b> sanada yozuv allaqachon bor (jami {formatLiters(dupInfo.totalL)}). Takroriy yozuv yaratilmaydi.
              <div className="mt-2"><Button size="sm" variant="secondary" onClick={() => { setCurrent(dupInfo); fill(dupInfo); setDupInfo(null); }}>Mavjud yozuvni tahrirlash</Button></div>
            </div>
          )}
        </div>
        <Field label="Mol" required error={err('animalId')}>
          <select className={`input ${err('animalId') ? 'input-error' : ''}`} {...register('animalId')} autoFocus={!current}>
            <option value="">Molni tanlang…</option>
            {list.map((a) => <option key={a.id} value={a.id}>{animalLabel(a)}</option>)}
          </select>
        </Field>
        <Field label="Sana" required error={err('recordDate')}>
          <input type="date" className={`input ${err('recordDate') ? 'input-error' : ''}`} {...register('recordDate')} />
        </Field>
        <Field label="Ertalab (L)" error={err('morningL')}><input inputMode="decimal" placeholder="0" className={`input ${err('morningL') ? 'input-error' : ''}`} {...register('morningL')} /></Field>
        <Field label="Kechqurun (L)" error={err('eveningL')}><input inputMode="decimal" placeholder="0" className={`input ${err('eveningL') ? 'input-error' : ''}`} {...register('eveningL')} /></Field>
        <Field label="Qo‘shimcha sog‘im (L)" error={err('extraL')} hint="Ixtiyoriy — masalan, tushlik vaqtidagi sog‘im"><input inputMode="decimal" placeholder="0" className={`input ${err('extraL') ? 'input-error' : ''}`} {...register('extraL')} /></Field>
        <div className="flex items-center justify-between self-start rounded-xl bg-brand-50 px-4 py-3 sm:mt-6">
          <span className="text-sm font-medium text-brand-800">Kunlik jami</span>
          <span className="text-xl font-bold text-brand-700">{formatLiters(total)}</span>
        </div>
        {settings.milkPrice > 0 && (
          <div className="rounded-lg bg-stone-50 px-4 py-2 text-sm text-stone-600 sm:col-span-2">
            Sut narxi: <b>{money(settings.milkPrice)}</b> / L · taxminiy daromad: <b className="text-stone-900">{money(Math.round(total * settings.milkPrice * 100) / 100)}</b> <span className="text-xs text-stone-400">(taxminiy, joriy narx bo‘yicha)</span>
          </div>
        )}
        <Field label="Izoh (ixtiyoriy)" error={err('notes')} className="sm:col-span-2"><textarea rows={2} className="input" {...register('notes')} /></Field>
      </form>
    </Modal>
  );
}

// ------------------------------------------------------------- kunlik jadval
interface DayRow { animalId: number; animalName: string; animalTag: string; animalStatus: string; recordId: number | null; morningL: number | null; eveningL: number | null; extraL: number | null; totalL: number | null }
type Cell = { m: string; e: string; x: string };
const show = (v: number | null) => (v === null || v === 0 ? '' : String(v).replace('.', ','));

function DaySheet({ today }: { today: string }) {
  const [date, setDate] = useState(today);
  const q = useQuery({ queryKey: ['milk-day', date], queryFn: () => api.get<{ date: string; rows: DayRow[] }>('/milk/day', { date }) });
  const [vals, setVals] = useState<Record<number, Cell>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!q.data) return;
    const v: Record<number, Cell> = {};
    for (const r of q.data.rows) v[r.animalId] = { m: show(r.morningL), e: show(r.eveningL), x: show(r.extraL) };
    setVals(v); setErrors({});
  }, [q.data]);

  const save = useMut((rows: { animalId: number; morningL: number; eveningL: number; extraL: number }[]) => api.post<{ saved: number }>('/milk/bulk', { recordDate: date, rows }),
    { success: (r) => `${r.saved} ta mol uchun sut saqlandi` });

  const set = (id: number, k: keyof Cell, value: string) => setVals((v) => ({ ...v, [id]: { ...v[id], [k]: value } }));
  const rowTotal = (c?: Cell) => (c ? dailyTotal(num(c.m), num(c.e), num(c.x)) : 0);
  const grand = useMemo(() => Object.values(vals).reduce((s, c) => s + rowTotal(c), 0), [vals]);

  const onSave = () => {
    const errs: Record<string, string> = {};
    const rows: { animalId: number; morningL: number; eveningL: number; extraL: number }[] = [];
    for (const r of q.data?.rows ?? []) {
      const c = vals[r.animalId];
      if (!c) continue;
      const touched = c.m.trim() || c.e.trim() || c.x.trim() || r.recordId;
      if (!touched) continue;
      const parsed = (['m', 'e', 'x'] as const).map((k) => {
        const res = qty(200, { zeroDefault: true }).safeParse(c[k]);
        if (!res.success) errs[`${r.animalId}${k}`] = res.error.issues[0].message;
        return res.success ? (res.data as number) : 0;
      });
      rows.push({ animalId: r.animalId, morningL: parsed[0], eveningL: parsed[1], extraL: parsed[2] });
    }
    setErrors(errs);
    if (Object.keys(errs).length) return;
    if (!rows.length) { return; }
    save.mutate(rows);
  };

  return (
    <Card padded={false}>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-stone-100 p-4">
        <div className="flex items-center gap-1">
          <IconButton label="Oldingi kun" onClick={() => setDate(addDays(date, -1))}><ChevronLeft className="h-5 w-5" /></IconButton>
          <input type="date" className="input w-44" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} />
          <IconButton label="Keyingi kun" onClick={() => setDate(addDays(date, 1))}><ChevronRight className="h-5 w-5" /></IconButton>
          {date !== today && <Button size="sm" variant="ghost" onClick={() => setDate(today)}>Bugun</Button>}
        </div>
        <p className="text-sm text-stone-500">Barcha mollarning sutini bir joyda kiriting. Mavjud yozuvlar yangilanadi, takroriy yozuv yaratilmaydi.</p>
      </div>
      {q.isLoading ? <Loading /> : q.error ? <ErrorState error={q.error} onRetry={() => q.refetch()} /> : !q.data?.rows.length ? (
        <EmptyState icon={<MilkIcon className="h-6 w-6" />} title="Faol mol yo‘q" text="Avval “Mollar” bo‘limida mol qo‘shing." />
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[34rem]">
              <thead className="bg-stone-50/60"><tr><th className="th">Mol</th><th className="th">Ertalab (L)</th><th className="th">Kechqurun (L)</th><th className="th">Qo‘shimcha (L)</th><th className="th text-right">Jami</th></tr></thead>
              <tbody className="divide-y divide-stone-100">
                {q.data.rows.map((r) => (
                  <tr key={r.animalId} className={r.animalStatus === 'inactive' ? 'bg-stone-50' : ''}>
                    <td className="td font-medium text-stone-900">{r.animalName} <span className="text-stone-400">({r.animalTag})</span>{r.recordId && <span className="ml-1 text-xs text-brand-600">●</span>}</td>
                    {(['m', 'e', 'x'] as const).map((k) => (
                      <td key={k} className="td">
                        <input inputMode="decimal" aria-label={`${r.animalName} ${k}`} className={`input !py-1.5 w-24 ${errors[`${r.animalId}${k}`] ? 'input-error' : ''}`} value={vals[r.animalId]?.[k] ?? ''} onChange={(e) => set(r.animalId, k, e.target.value)} placeholder="0" />
                        {errors[`${r.animalId}${k}`] && <div className="mt-0.5 max-w-[10rem] text-[11px] text-red-600">{errors[`${r.animalId}${k}`]}</div>}
                      </td>
                    ))}
                    <td className="td text-right font-semibold">{formatLiters(rowTotal(vals[r.animalId]))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="sticky bottom-16 flex flex-wrap items-center justify-between gap-3 border-t border-stone-100 bg-white/95 p-4 backdrop-blur lg:bottom-0">
            <div className="text-sm text-stone-600">{formatDateUz(date)} · jami: <b className="text-lg text-brand-700">{formatLiters(grand)}</b></div>
            <Button icon={<Save className="h-4 w-4" />} loading={save.isPending} onClick={onSave}>Hammasini saqlash</Button>
          </div>
        </>
      )}
    </Card>
  );
}

// ------------------------------------------------------------------ sahifa
export function Milk() {
  const { today, money, settings } = useApp();
  const [params, setParams] = useSearchParams();
  const animals = useAnimalOptions();
  const [tab, setTab] = useState<'list' | 'day'>('list');
  const mo = monthRange(today);
  const { filters, patch, page, setPage } = useFilters({ from: mo.from, to: today, animalId: params.get('animalId') ?? '', search: '' });
  const { sort, dir, onSort } = useSort('date', 'desc');
  const [formOpen, setFormOpen] = useState(false);
  const [priceOpen, setPriceOpen] = useState(false);
  const [editing, setEditing] = useState<MilkRecord | null>(null);
  const [deleting, setDeleting] = useState<MilkRecord | null>(null);

  useEffect(() => { if (params.get('new') === '1') { setEditing(null); setFormOpen(true); setParams((p) => { p.delete('new'); return p; }, { replace: true }); } }, [params, setParams]);

  const query = { ...filters, sort, dir, page, pageSize: 15 };
  const q = useList<MilkList>('milk', '/milk', query);
  const remove = useMut((id: number) => api.del(`/milk/${id}`), { success: 'Sut yozuvi o‘chirildi', onSuccess: () => setDeleting(null) });
  const d = q.data;
  const single = filters.from === filters.to;

  async function exportCsv() {
    const all = await api.get<MilkList>('/milk', { ...filters, sort, dir, pageSize: 'all' });
    downloadCsv(`sut-yozuvlari_${filters.from}_${filters.to}`, ['Sana', 'Mol raqami', 'Mol nomi', 'Ertalab (L)', 'Kechqurun (L)', 'Qo‘shimcha (L)', 'Jami (L)', 'Izoh'],
      all.rows.map((r) => [r.recordDate, r.animalTag, r.animalName, r.morningL, r.eveningL, r.extraL, r.totalL, r.notes]));
  }

  return (
    <>
      <PageHeader title="Sut hisobi" subtitle="Har bir mol uchun kunlik sut: ertalab, kechqurun va qo‘shimcha sog‘im"
        actions={<Button icon={<Plus className="h-4 w-4" />} onClick={() => { setEditing(null); setFormOpen(true); }}>Sut kiritish</Button>} />
      <div className="mb-4 flex flex-wrap items-center gap-3 rounded-xl border border-brand-200 bg-brand-50/60 px-4 py-3 text-sm">
        <Tag className="h-4 w-4 text-brand-700" />
        <span className="text-brand-900">Sut narxi: <b>{settings.milkPrice > 0 ? `${money(settings.milkPrice)} / L` : 'kiritilmagan'}</b></span>
        <Button size="sm" variant="secondary" onClick={() => setPriceOpen(true)}>{settings.milkPrice > 0 ? 'Narxni o‘zgartirish' : 'Narxni yozish'}</Button>
      </div>
      <MilkPriceModal open={priceOpen} onClose={() => setPriceOpen(false)} />
      <Tabs value={tab} onChange={setTab} tabs={[{ id: 'list', label: 'Yozuvlar' }, { id: 'day', label: 'Kunlik jadval (hammasini kiritish)' }]} />

      {tab === 'day' ? <DaySheet today={today} /> : (
        <>
          <FilterBar>
            <DateRange from={filters.from} to={filters.to} today={today} onChange={(r) => patch(r)} />
            <label className="min-w-[12rem] flex-1 text-xs font-medium text-stone-500 sm:flex-none">Mol
              <AnimalSelect className="mt-0.5" value={filters.animalId} onChange={(v) => patch({ animalId: v })} animals={animals.data ?? []} />
            </label>
            <SearchInput className="min-w-[10rem] flex-1" value={filters.search} onChange={(v) => patch({ search: v })} placeholder="Mol nomi yoki raqami" />
            <Button variant="secondary" icon={<Download className="h-4 w-4" />} onClick={exportCsv}>CSV</Button>
          </FilterBar>

          <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard label={single ? `Kunlik jami (${formatDateShort(filters.from)})` : 'Tanlangan davrdagi jami sut'} value={formatLiters(d?.sumLiters ?? 0)} icon={<MilkIcon className="h-5 w-5" />} hint="barcha mollar" />
            <StatCard label="Yozuvlar soni" value={d?.total ?? 0} hint="mol × kun" />
            <StatCard label="Mollar soni" value={d?.perAnimal.length ?? 0} hint="sut yozilgan" />
            <StatCard label="Bir yozuvga o‘rtacha" value={formatLiters(d && d.total ? d.sumLiters / d.total : 0)} />
            {settings.milkPrice > 0 && <StatCard label="Taxminiy sut daromadi" value={money(Math.round((d?.sumLiters ?? 0) * settings.milkPrice))} tone="amber" badge="taxminiy" hint={`joriy narx: ${money(settings.milkPrice)} / L`} />}
          </div>

          {d && d.perAnimal.length > 0 && (
            <Card title={single ? 'Mollar bo‘yicha kunlik jami' : 'Mollar bo‘yicha jami (tanlangan davr)'} className="mb-4">
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {d.perAnimal.map((p) => (
                  <button key={p.animalId} type="button" onClick={() => patch({ animalId: String(p.animalId) })} className="flex items-center justify-between rounded-xl bg-stone-50 px-3 py-2 text-left text-sm hover:bg-brand-50">
                    <span className="truncate font-medium text-stone-800">{p.animalName} <span className="text-stone-400">({p.animalTag})</span></span>
                    <span className="ml-2 shrink-0 font-bold text-brand-700">{formatLiters(p.liters)}</span>
                  </button>
                ))}
              </div>
            </Card>
          )}

          <Card padded={false}>
            {q.isLoading ? <Loading /> : q.error ? <ErrorState error={q.error} onRetry={() => q.refetch()} /> : !d || d.rows.length === 0 ? (
              <EmptyState icon={<MilkIcon className="h-6 w-6" />} title="Sut yozuvlari topilmadi" text="Tanlangan davr yoki filtrda yozuv yo‘q. Yangi yozuv qo‘shing yoki sanani o‘zgartiring."
                action={<Button icon={<Plus className="h-4 w-4" />} onClick={() => { setEditing(null); setFormOpen(true); }}>Sut kiritish</Button>} />
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[36rem]">
                    <thead className="border-b border-stone-100 bg-stone-50/60"><tr>
                      <SortTh label="Sana" field="date" sort={sort} dir={dir} onSort={onSort} />
                      <SortTh label="Mol" field="animal" sort={sort} dir={dir} onSort={onSort} />
                      <th className="th text-right">Ertalab</th><th className="th text-right">Kechqurun</th><th className="th hidden text-right md:table-cell">Qo‘shimcha</th>
                      <SortTh label="Jami" field="total" sort={sort} dir={dir} onSort={onSort} className="text-right" />
                      <th className="th text-right">Amallar</th>
                    </tr></thead>
                    <tbody className="divide-y divide-stone-100">
                      {d.rows.map((r) => (
                        <tr key={r.id} className="hover:bg-stone-50/70">
                          <td className="td whitespace-nowrap">{formatDateShort(r.recordDate)}</td>
                          <td className="td font-medium text-stone-900">{r.animalName} <span className="text-stone-400">({r.animalTag})</span>{r.animalStatus === 'inactive' && <span className="ml-1 text-xs text-stone-400">nofaol</span>}</td>
                          <td className="td text-right">{formatNumber(r.morningL)}</td><td className="td text-right">{formatNumber(r.eveningL)}</td><td className="td hidden text-right md:table-cell">{formatNumber(r.extraL)}</td>
                          <td className="td text-right font-bold text-stone-900">{formatLiters(r.totalL)}</td>
                          <td className="td"><div className="flex justify-end">
                            <IconButton label="Tahrirlash" onClick={() => { setEditing(r); setFormOpen(true); }}><Pencil className="h-4 w-4" /></IconButton>
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
        </>
      )}

      <MilkFormModal open={formOpen} onClose={() => setFormOpen(false)} record={editing} defaultAnimalId={filters.animalId} />
      <ConfirmDialog open={!!deleting} title="Sut yozuvini o‘chirish" loading={remove.isPending}
        message={deleting && <>{formatDateUz(deleting.recordDate)} sanadagi <b>{deleting.animalName}</b> uchun {formatLiters(deleting.totalL)} sut yozuvini o‘chirmoqchimisiz? Hisobotlar avtomatik yangilanadi.</>}
        onCancel={() => setDeleting(null)} onConfirm={() => deleting && remove.mutate(deleting.id)} />
    </>
  );
}
