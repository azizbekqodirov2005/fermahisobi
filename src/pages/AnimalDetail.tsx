import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Pencil, Power, Trash2 } from 'lucide-react';
import { api } from '../lib/api';
import { useApp, useMut } from '../lib/app';
import { addDays, formatDateUz, formatDayMonth, parseYmd } from '../../shared/dates';
import { formatAge, formatKg, formatLiters } from '../../shared/format';
import type { Animal } from '../../shared/types';
import { Badge, Button, Card, ConfirmDialog, EmptyState, ErrorState, Loading, PageHeader, StatCard } from '../components/ui';
import { SimpleBar } from '../components/charts';
import { AnimalFormModal } from './Animals';

interface Detail {
  animal: Animal;
  stats: { milkTotalL: number; milkDays: number; milkAvgPerDay: number; milkLast30L: number; feedTotalKg: number; feedTotalCost: number };
  dailyLast30: { date: string; liters: number }[];
  recentMilk: { id: number; recordDate: string; morningL: number; eveningL: number; extraL: number; totalL: number }[];
  recentFeed: { id: number; recordDate: string; feedType: string; quantityKg: number; pricePerKg: number; totalCost: number }[];
}

export function AnimalDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { money, today } = useApp();
  const q = useQuery({ queryKey: ['animal', id], queryFn: () => api.get<Detail>(`/animals/${id}`) });
  const [editOpen, setEditOpen] = useState(false);
  const [delOpen, setDelOpen] = useState(false);
  const toggle = useMut((a: Animal) => api.patch<Animal>(`/animals/${a.id}/status`, { status: a.status === 'active' ? 'inactive' : 'active' }), {
    success: (a) => (a.status === 'active' ? 'Mol faollashtirildi' : 'Mol nofaol qilindi — tarixiy yozuvlar saqlanib qoladi'),
  });
  const remove = useMut((aid: number) => api.del(`/animals/${aid}`), { success: 'Mol o‘chirildi', onSuccess: () => navigate('/mollar') });

  if (q.isLoading) return <Loading />;
  if (q.error || !q.data) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  const { animal: a, stats, dailyLast30, recentMilk, recentFeed } = q.data;

  const byDate = new Map(dailyLast30.map((d) => [d.date, d.liters]));
  const chart = Array.from({ length: 30 }, (_, i) => {
    const d = addDays(today, -(29 - i));
    return { label: String(parseYmd(d).d), sub: formatDateUz(d), value: byDate.get(d) ?? 0, highlight: d === today };
  });

  return (
    <>
      <Link to="/mollar" className="mb-3 inline-flex items-center gap-1 text-sm font-medium text-stone-500 hover:text-stone-800"><ArrowLeft className="h-4 w-4" /> Mollar ro‘yxati</Link>
      <PageHeader title={`${a.name} · ${a.tagNumber}`} subtitle={<Badge tone={a.status === 'active' ? 'green' : 'gray'}>{a.status === 'active' ? 'Faol' : 'Nofaol'}</Badge>}
        actions={<>
          <Button variant="secondary" icon={<Pencil className="h-4 w-4" />} onClick={() => setEditOpen(true)}>Tahrirlash</Button>
          <Button variant="secondary" icon={<Power className="h-4 w-4" />} loading={toggle.isPending} onClick={() => toggle.mutate(a)}>{a.status === 'active' ? 'Nofaol qilish' : 'Faollashtirish'}</Button>
          <Button variant="secondary" className="!text-red-600" icon={<Trash2 className="h-4 w-4" />} onClick={() => setDelOpen(true)}>O‘chirish</Button>
        </>} />

      <div className="grid grid-cols-1 gap-5">
        <Card title="Mol ma’lumotlari">
          <dl className="grid grid-cols-2 gap-x-6 gap-y-4 text-sm md:grid-cols-4">
            <Info label="Yoshi" value={formatAge(a.age)} />
            <Info label="Tug‘ilgan sana" value={a.birthDate ? formatDateUz(a.birthDate) : 'Kiritilmagan (yosh qo‘lda kiritilgan)'} />
            <Info label="Standart yemish (kuniga)" value={formatKg(a.dailyFeedKg)} />
            <Info label="Qo‘shilgan sana" value={formatDateUz(a.dateAdded)} />
            <div className="col-span-2 md:col-span-4"><Info label="Izoh" value={a.notes || '—'} /></div>
          </dl>
        </Card>

        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard label="Jami sut (barcha vaqt)" value={formatLiters(stats.milkTotalL)} hint={`${stats.milkDays} kunlik yozuv`} />
          <StatCard label="Kunlik o‘rtacha" value={formatLiters(stats.milkAvgPerDay)} hint="yozuv bor kunlar bo‘yicha" />
          <StatCard label="Oxirgi 30 kun" value={formatLiters(stats.milkLast30L)} />
          <StatCard label="Jami yemish" value={formatKg(stats.feedTotalKg)} tone="amber" hint={money(stats.feedTotalCost)} />
        </div>

        <Card title="Oxirgi 30 kunlik sut"><SimpleBar data={chart} /></Card>

        <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
          <Card title="So‘nggi sut yozuvlari" action={<Link className="text-sm font-semibold text-brand-700 hover:underline" to={`/sut?animalId=${a.id}`}>Hammasi</Link>} padded={false}>
            {recentMilk.length === 0 ? <EmptyState title="Sut yozuvlari yo‘q" /> : (
              <div className="overflow-x-auto"><table className="w-full"><thead className="bg-stone-50/60"><tr><th className="th">Sana</th><th className="th text-right">Ertalab</th><th className="th text-right">Kechqurun</th><th className="th text-right">Jami</th></tr></thead>
                <tbody className="divide-y divide-stone-100">{recentMilk.map((r) => <tr key={r.id}><td className="td">{formatDayMonth(r.recordDate)}</td><td className="td text-right">{formatLiters(r.morningL)}</td><td className="td text-right">{formatLiters(r.eveningL)}</td><td className="td text-right font-semibold">{formatLiters(r.totalL)}</td></tr>)}</tbody></table></div>
            )}
          </Card>
          <Card title="So‘nggi yemish yozuvlari" action={<Link className="text-sm font-semibold text-brand-700 hover:underline" to={`/yemish?animalId=${a.id}`}>Hammasi</Link>} padded={false}>
            {recentFeed.length === 0 ? <EmptyState title="Yemish yozuvlari yo‘q" /> : (
              <div className="overflow-x-auto"><table className="w-full"><thead className="bg-stone-50/60"><tr><th className="th">Sana</th><th className="th">Turi</th><th className="th text-right">Miqdor</th><th className="th text-right">Xarajat</th></tr></thead>
                <tbody className="divide-y divide-stone-100">{recentFeed.map((r) => <tr key={r.id}><td className="td">{formatDayMonth(r.recordDate)}</td><td className="td">{r.feedType || '—'}</td><td className="td text-right">{formatKg(r.quantityKg)}</td><td className="td text-right font-semibold">{money(r.totalCost)}</td></tr>)}</tbody></table></div>
            )}
          </Card>
        </div>
      </div>

      <AnimalFormModal open={editOpen} onClose={() => setEditOpen(false)} animal={a} />
      {a.hasHistory ? (
        <ConfirmDialog open={delOpen} danger={false} title="Molni o‘chirib bo‘lmaydi" cancelLabel="Yopish"
          confirmLabel={a.status === 'active' ? 'Nofaol qilish' : 'Tushunarli'}
          message={<>Bu molning sut yoki yemish yozuvlari bor. Tarix saqlanishi uchun o‘chirib bo‘lmaydi{a.status === 'active' ? ' — o‘rniga nofaol qiling.' : '; u allaqachon nofaol.'}</>}
          onCancel={() => setDelOpen(false)} onConfirm={() => { if (a.status === 'active') toggle.mutate(a); setDelOpen(false); }} />
      ) : (
        <ConfirmDialog open={delOpen} title="Molni o‘chirish" loading={remove.isPending} message={<><b>{a.name}</b> ({a.tagNumber}) molini o‘chirmoqchimisiz? Bu amalni qaytarib bo‘lmaydi.</>}
          onCancel={() => setDelOpen(false)} onConfirm={() => remove.mutate(a.id)} />
      )}
    </>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return <div><dt className="text-xs font-medium text-stone-500">{label}</dt><dd className="mt-0.5 font-medium text-stone-900">{value}</dd></div>;
}
