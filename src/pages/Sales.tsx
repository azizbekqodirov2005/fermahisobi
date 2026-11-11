import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import type { z } from 'zod';
import { useQuery } from '@tanstack/react-query';
import { Download, HandCoins, Pencil, Plus, Trash2 } from 'lucide-react';
import { api } from '../lib/api';
import { applyApiError, useApp, useMut } from '../lib/app';
import { useFilters, useList, useSort } from '../lib/hooks';
import { downloadCsv } from '../lib/csv';
import { saleSchema } from '../../shared/schemas';
import { formatDateShort, formatDateUz, monthRange } from '../../shared/dates';
import { formatLiters, formatNumber } from '../../shared/format';
import { round2 } from '../../shared/calc';
import type { MilkSale, Paged } from '../../shared/types';
import { Button, Card, ConfirmDialog, EmptyState, ErrorState, Field, FormError, IconButton, Loading, Modal, PageHeader, Pagination, SortTh, StatCard } from '../components/ui';
import { DateRange, FilterBar, SearchInput } from '../components/filters';

type SaleList = Paged<MilkSale> & { sumLiters: number; sumRevenue: number };
type FormIn = z.input<typeof saleSchema>;
const num = (v: unknown) => { const n = Number(String(v ?? '').replace(',', '.').replace(/\s/g, '')); return Number.isFinite(n) ? n : 0; };
const fmtInput = (n: number) => (n ? String(n).replace('.', ',') : '');

function SaleFormModal({ open, onClose, sale }: { open: boolean; onClose: () => void; sale: MilkSale | null }) {
  const { today, money, settings } = useApp();
  const [formError, setFormError] = useState('');
  const [priceTouched, setPriceTouched] = useState(false);
  const { register, handleSubmit, reset, setError, setValue, control, formState: { errors } } = useForm<FormIn, unknown, z.output<typeof saleSchema>>({ resolver: zodResolver(saleSchema) });
  const [date, qty, price] = useWatch({ control, name: ['saleDate', 'quantityL', 'pricePerL'] });

  useEffect(() => {
    if (!open) return;
    setFormError(''); setPriceTouched(!!sale);
    reset(sale
      ? { saleDate: sale.saleDate, quantityL: fmtInput(sale.quantityL), pricePerL: fmtInput(sale.pricePerL), customerName: sale.customerName ?? '', notes: sale.notes ?? '' }
      : { saleDate: today, quantityL: '', pricePerL: fmtInput(settings.milkPrice), customerName: '', notes: '' });
  }, [open, sale, reset, today, settings.milkPrice]);

  // Yangi sotuvda sana o'zgarsa, o'sha sanada amaldagi narx taklif qilinadi
  const applicable = useQuery({
    queryKey: ['price-on', 'milk', date],
    queryFn: async () => (await api.get<{ price: number }>('/prices/on', { kind: 'milk', date })).price,
    enabled: open && !sale && typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date),
  });
  useEffect(() => { if (open && !sale && !priceTouched && applicable.data !== undefined) setValue('pricePerL', fmtInput(applicable.data)); }, [applicable.data, open, sale, priceTouched, setValue]);

  const save = useMut((v: z.output<typeof saleSchema>) => (sale ? api.put<MilkSale>(`/sales/${sale.id}`, v) : api.post<MilkSale>('/sales', v)),
    { success: sale ? 'Sotuv yangilandi' : 'Sotuv saqlandi', silentError: true, onSuccess: onClose });
  const submit = handleSubmit((v) => {
    setFormError('');
    save.mutate(v, { onError: (e) => { if (!applyApiError(e, setError)) setFormError(e instanceof Error ? e.message : 'Xatolik'); } });
  }, () => setFormError('Iltimos, qizil bilan ko‘rsatilgan maydonlarni to‘g‘rilang.'));
  const err = (k: keyof FormIn) => errors[k]?.message as string | undefined;

  return (
    <Modal open={open} onClose={onClose} title={sale ? 'Sotuvni tahrirlash' : 'Sut sotuvini kiritish'}
      footer={<><Button variant="secondary" onClick={onClose}>Bekor qilish</Button><Button loading={save.isPending} onClick={submit}>Saqlash</Button></>}>
      <form onSubmit={submit} noValidate className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2"><FormError message={formError} /></div>
        <Field label="Sana" required error={err('saleDate')}><input type="date" className="input" {...register('saleDate')} /></Field>
        <Field label="Sotilgan sut (L)" required error={err('quantityL')}><input inputMode="decimal" autoFocus className={`input ${err('quantityL') ? 'input-error' : ''}`} placeholder="0" {...register('quantityL')} /></Field>
        <Field label="1 litr narxi (so‘m)" error={err('pricePerL')} hint="Shu sanada amaldagi narx; o‘zgartirish mumkin. Narx sotuv yozuvida saqlanadi.">
          <input inputMode="decimal" className={`input ${err('pricePerL') ? 'input-error' : ''}`} {...register('pricePerL', { onChange: () => setPriceTouched(true) })} />
        </Field>
        <div className="flex items-center justify-between self-start rounded-xl bg-brand-50 px-4 py-3 sm:mt-6">
          <span className="text-sm font-medium text-brand-800">Jami daromad</span>
          <span className="text-xl font-bold text-brand-700">{money(round2(num(qty) * num(price)))}</span>
        </div>
        <Field label="Mijoz (ixtiyoriy)" error={err('customerName')} className="sm:col-span-2"><input className="input" placeholder="Masalan: Sut zavodi" {...register('customerName')} /></Field>
        <Field label="Izoh (ixtiyoriy)" error={err('notes')} className="sm:col-span-2"><textarea rows={2} className="input" {...register('notes')} /></Field>
      </form>
    </Modal>
  );
}

export function Sales() {
  const { today, money } = useApp();
  const [params, setParams] = useSearchParams();
  const mo = monthRange(today);
  const { filters, patch, page, setPage } = useFilters({ from: mo.from, to: today, search: '' });
  const { sort, dir, onSort } = useSort('date', 'desc');
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<MilkSale | null>(null);
  const [deleting, setDeleting] = useState<MilkSale | null>(null);
  useEffect(() => { if (params.get('new') === '1') { setEditing(null); setFormOpen(true); setParams((p) => { p.delete('new'); return p; }, { replace: true }); } }, [params, setParams]);

  const q = useList<SaleList>('sales', '/sales', { ...filters, sort, dir, page, pageSize: 15 });
  const remove = useMut((id: number) => api.del(`/sales/${id}`), { success: 'Sotuv o‘chirildi', onSuccess: () => setDeleting(null) });
  const d = q.data;
  const openNew = () => { setEditing(null); setFormOpen(true); };

  async function exportCsv() {
    const all = await api.get<SaleList>('/sales', { ...filters, sort, dir, pageSize: 'all' });
    downloadCsv(`sut-sotuvlari_${filters.from}_${filters.to}`, ['Sana', 'Sotilgan (L)', '1 litr narxi', 'Jami daromad', 'Mijoz', 'Izoh'],
      all.rows.map((r) => [r.saleDate, r.quantityL, r.pricePerL, r.totalRevenue, r.customerName, r.notes]));
  }

  return (
    <>
      <PageHeader title="Sut sotuvlari" subtitle="Haqiqiy sotilgan sut va daromad. Ishlab chiqarilgan va sotilgan sut farq qilishi mumkin."
        actions={<Button icon={<Plus className="h-4 w-4" />} onClick={openNew}>Sut sotuvini kiritish</Button>} />
      <FilterBar>
        <DateRange from={filters.from} to={filters.to} today={today} onChange={(r) => patch(r)} />
        <SearchInput className="min-w-[10rem] flex-1" value={filters.search} onChange={(v) => patch({ search: v })} placeholder="Mijoz nomi" />
        <Button variant="secondary" icon={<Download className="h-4 w-4" />} onClick={exportCsv}>CSV</Button>
      </FilterBar>

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Sotilgan sut" value={formatLiters(d?.sumLiters ?? 0)} icon={<HandCoins className="h-5 w-5" />} tone="blue" />
        <StatCard label="Sotuv daromadi" value={money(d?.sumRevenue ?? 0)} tone="blue" hint="haqiqiy sotuv" />
        <StatCard label="O‘rtacha narx" value={money(d && d.sumLiters ? d.sumRevenue / d.sumLiters : 0)} hint="1 litr" />
        <StatCard label="Sotuvlar soni" value={d?.total ?? 0} />
      </div>

      <Card padded={false}>
        {q.isLoading ? <Loading /> : q.error ? <ErrorState error={q.error} onRetry={() => q.refetch()} /> : !d || d.rows.length === 0 ? (
          <EmptyState icon={<HandCoins className="h-6 w-6" />} title="Sotuv yozuvlari topilmadi"
            text="Sotuv kiritilmasa, hisobotlarda daromad ishlab chiqarilgan sutdan hisoblangan va “taxminiy” deb belgilanadi."
            action={<Button icon={<Plus className="h-4 w-4" />} onClick={openNew}>Sut sotuvini kiritish</Button>} />
        ) : (
          <>
            <div className="overflow-x-auto"><table className="w-full min-w-[34rem]">
              <thead className="border-b border-stone-100 bg-stone-50/60"><tr>
                <SortTh label="Sana" field="date" sort={sort} dir={dir} onSort={onSort} />
                <SortTh label="Miqdor" field="quantity" sort={sort} dir={dir} onSort={onSort} className="text-right" />
                <th className="th hidden text-right sm:table-cell">1 litr narxi</th>
                <SortTh label="Daromad" field="revenue" sort={sort} dir={dir} onSort={onSort} className="text-right" />
                <SortTh label="Mijoz" field="customer" sort={sort} dir={dir} onSort={onSort} className="hidden md:table-cell" />
                <th className="th text-right">Amallar</th>
              </tr></thead>
              <tbody className="divide-y divide-stone-100">{d.rows.map((r) => (
                <tr key={r.id} className="hover:bg-stone-50/70">
                  <td className="td whitespace-nowrap">{formatDateShort(r.saleDate)}</td>
                  <td className="td text-right">{formatLiters(r.quantityL)}</td>
                  <td className="td hidden text-right sm:table-cell">{formatNumber(r.pricePerL, 0)}</td>
                  <td className="td text-right font-bold text-stone-900">{money(r.totalRevenue)}</td>
                  <td className="td hidden md:table-cell">{r.customerName || '—'}</td>
                  <td className="td"><div className="flex justify-end">
                    <IconButton label="Tahrirlash" onClick={() => { setEditing(r); setFormOpen(true); }}><Pencil className="h-4 w-4" /></IconButton>
                    <IconButton label="O‘chirish" className="hover:!bg-red-50 hover:!text-red-600" onClick={() => setDeleting(r)}><Trash2 className="h-4 w-4" /></IconButton>
                  </div></td>
                </tr>
              ))}</tbody></table></div>
            <Pagination page={d.page} totalPages={d.totalPages} total={d.total} pageSize={d.pageSize} onPage={setPage} />
          </>
        )}
      </Card>

      <SaleFormModal open={formOpen} onClose={() => setFormOpen(false)} sale={editing} />
      <ConfirmDialog open={!!deleting} title="Sotuvni o‘chirish" loading={remove.isPending}
        message={deleting && <>{formatDateUz(deleting.saleDate)} sanadagi {formatLiters(deleting.quantityL)} sotuvni ({money(deleting.totalRevenue)}) o‘chirmoqchimisiz? Moliyaviy hisobotlar avtomatik yangilanadi.</>}
        onCancel={() => setDeleting(null)} onConfirm={() => deleting && remove.mutate(deleting.id)} />
    </>
  );
}
