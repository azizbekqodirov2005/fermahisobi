import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AlertTriangle, Banknote, CalendarDays, CalendarRange, Droplets, Milk, PawPrint, Plus, Scale, Wallet, Wheat } from 'lucide-react';
import { useApp } from '../lib/app';
import { useList } from '../lib/hooks';
import { addDays, formatDateUz, formatDayMonth, monthRange, parseYmd, weekRange, WEEKDAYS_UZ_SHORT, weekdayIndex } from '../../shared/dates';
import { formatKg, formatLiters, formatNumber } from '../../shared/format';
import { Badge, Button, Card, EmptyState, ErrorState, Loading, PageHeader, StatCard } from '../components/ui';
import { DateRange } from '../components/filters';
import { SimpleBar } from '../components/charts';

interface Series { date: string; value: number }
interface DashboardData {
  today: string;
  week: { from: string; to: string };
  month: { from: string; to: string };
  range: { from: string; to: string };
  cards: {
    animalsActive: number; animalsTotal: number; milkToday: number; milkWeek: number; milkMonth: number;
    feedKgToday: number; feedCostToday: number; revenueToday: number; revenueKind: 'actual' | 'estimated';
    revenueActualToday: number; revenueEstimatedToday: number; balanceToday: number;
  };
  weekSeries: Series[]; monthSeries: Series[]; rangeSeries: Series[];
  rangeSummary: { milkL: number; feedKg: number; feedCost: number; soldL: number; actualRevenue: number; estimatedRevenue: number; hasSales: boolean; balanceActual: number; balanceEstimated: number };
  perAnimal: { animalId: number; name: string; tag: string; liters: number }[];
  recentMilk: { id: number; animalName: string; animalTag: string; recordDate: string; morningL: number; eveningL: number; extraL: number; totalL: number }[];
  recentFeed: { id: number; animalName: string; animalTag: string; recordDate: string; feedType: string; quantityKg: number; totalCost: number }[];
  pricesMissing: { milk: boolean; feed: boolean };
  hasAnimals: boolean;
}

export function Dashboard() {
  const { today, money, settings } = useApp();
  const navigate = useNavigate();
  const mo = monthRange(today);
  const [range, setRange] = useState({ from: mo.from, to: today });
  const q = useList<DashboardData>('dashboard', '/dashboard', range);
  const d = q.data;

  const weekData = d?.weekSeries.map((p) => ({ label: WEEKDAYS_UZ_SHORT[weekdayIndex(p.date)], sub: formatDateUz(p.date), value: p.value, highlight: p.date === today }));
  const monthData = d?.monthSeries.map((p) => ({ label: String(parseYmd(p.date).d), sub: formatDateUz(p.date), value: p.value, highlight: p.date === today }));
  const rangeData = d?.rangeSeries.map((p) => ({ label: d.rangeSeries.length > 14 ? String(parseYmd(p.date).d) : formatDayMonth(p.date), sub: formatDateUz(p.date), value: p.value, highlight: p.date === today }));

  return (
    <>
      <PageHeader title="Bosh sahifa" subtitle={`${settings.farmName} · ${formatDateUz(today)}`}
        actions={
          <>
            <Button icon={<Plus className="h-4 w-4" />} onClick={() => navigate('/sut?new=1')}>Sut kiritish</Button>
            <Button variant="secondary" icon={<Plus className="h-4 w-4" />} onClick={() => navigate('/yemish?new=1')}>Yemish kiritish</Button>
            <Button variant="secondary" icon={<Plus className="h-4 w-4" />} onClick={() => navigate('/sotuvlar?new=1')}>Sut sotuvini kiritish</Button>
            <Button variant="secondary" icon={<Plus className="h-4 w-4" />} onClick={() => navigate('/mollar?new=1')}>Mol qo‘shish</Button>
          </>
        } />

      {q.isLoading ? <Loading /> : q.error || !d ? <ErrorState error={q.error} onRetry={() => q.refetch()} /> : (
        <div className="space-y-5">
          {(d.pricesMissing.milk || d.pricesMissing.feed) && (
            <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
              <div>
                <b>{[d.pricesMissing.milk && 'Sut narxi', d.pricesMissing.feed && 'Yemish narxi'].filter(Boolean).join(' va ')} hali kiritilmagan.</b>{' '}
                Daromad va xarajatlar to‘g‘ri hisoblanishi uchun <Link to="/sozlamalar" className="font-semibold underline">Narxlar va sozlamalar</Link> sahifasida narxlarni kiriting.
              </div>
            </div>
          )}

          {!d.hasAnimals && (
            <Card><EmptyState icon={<PawPrint className="h-6 w-6" />} title="Boshlash uchun mollarni qo‘shing" text="Mollar qo‘shilgach, sut va yemish yozuvlari kiritiladi va bu yerda real statistikalar paydo bo‘ladi."
              action={<Button icon={<Plus className="h-4 w-4" />} onClick={() => navigate('/mollar?new=1')}>Mol qo‘shish</Button>} /></Card>
          )}

          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard label="Jami mollar soni" value={d.cards.animalsActive} icon={<PawPrint className="h-5 w-5" />}
              hint={d.cards.animalsTotal > d.cards.animalsActive ? `faol · jami ${d.cards.animalsTotal}` : 'faol mol'} />
            <StatCard label="Bugungi jami sut" value={formatLiters(d.cards.milkToday)} icon={<Droplets className="h-5 w-5" />} hint="litr" />
            <StatCard label="Shu haftadagi jami sut" value={formatLiters(d.cards.milkWeek)} icon={<CalendarRange className="h-5 w-5" />} hint={`${formatDayMonth(d.week.from)} – ${formatDayMonth(d.week.to)} (Du–Ya)`} />
            <StatCard label="Shu oydagi jami sut" value={formatLiters(d.cards.milkMonth)} icon={<CalendarDays className="h-5 w-5" />} hint="joriy oy" />
            <StatCard label="Bugungi yemish sarfi" value={formatKg(d.cards.feedKgToday)} icon={<Wheat className="h-5 w-5" />} tone="amber" hint="yozilgan haqiqiy sarf" />
            <StatCard label="Bugungi sut daromadi" value={money(d.cards.revenueToday)} icon={<Banknote className="h-5 w-5" />} tone="blue"
              badge={d.cards.revenueKind === 'estimated' ? <Badge tone="amber">Taxminiy</Badge> : <Badge tone="green">Sotuv bo‘yicha</Badge>}
              hint={d.cards.revenueKind === 'estimated' ? 'bugun sotuv kiritilmagan' : undefined} />
            <StatCard label="Bugungi yemish xarajati" value={money(d.cards.feedCostToday)} icon={<Wallet className="h-5 w-5" />} tone="amber" hint="yozuvdagi narx bo‘yicha" />
            <StatCard label="Sut daromadi − yemish xarajati" value={money(d.cards.balanceToday)} icon={<Scale className="h-5 w-5" />} tone="stone"
              badge={d.cards.revenueKind === 'estimated' ? <Badge tone="amber">Taxminiy</Badge> : undefined} hint="sof foyda emas" />
          </div>

          <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
            <Card title="Haftalik sut (Dushanba–Yakshanba)" action={<span className="text-xs text-stone-500">{formatLiters(d.cards.milkWeek)}</span>}>
              <SimpleBar data={weekData!} />
            </Card>
            <Card title="Oylik sut (kunlar bo‘yicha)" action={<span className="text-xs text-stone-500">{formatLiters(d.cards.milkMonth)}</span>}>
              <SimpleBar data={monthData!} />
            </Card>
          </div>

          <Card title="Tanlangan davr" action={<span className="text-xs text-stone-500">Quyidagi ko‘rsatkichlar va grafiklar shu davr uchun</span>}>
            <DateRange from={range.from} to={range.to} today={today} onChange={setRange} />
            <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
              <MiniStat label="Ishlab chiqarilgan sut" value={formatLiters(d.rangeSummary.milkL)} />
              <MiniStat label="Yemish sarfi" value={formatKg(d.rangeSummary.feedKg)} />
              <MiniStat label="Yemish xarajati" value={money(d.rangeSummary.feedCost)} />
              <MiniStat label={d.rangeSummary.hasSales ? 'Sotuv daromadi' : 'Taxminiy sut daromadi'} value={money(d.rangeSummary.hasSales ? d.rangeSummary.actualRevenue : d.rangeSummary.estimatedRevenue)}
                note={d.rangeSummary.hasSales ? `${formatLiters(d.rangeSummary.soldL)} sotilgan` : 'sotuv kiritilmagan'} />
            </div>
            <div className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-2">
              <div>
                <h3 className="mb-2 text-sm font-semibold text-stone-700">Kunlik sut dinamikasi</h3>
                <SimpleBar data={rangeData!} height={240} />
              </div>
              <div>
                <h3 className="mb-2 text-sm font-semibold text-stone-700">Mollar bo‘yicha taqqoslash</h3>
                <SimpleBar layout="horizontal" data={d.perAnimal.slice(0, 12).map((a) => ({ label: a.name, value: a.liters }))} height={Math.max(200, Math.min(d.perAnimal.length, 12) * 34 + 30)} />
              </div>
            </div>
          </Card>

          <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
            <Card title="So‘nggi sut yozuvlari" action={<Link to="/sut" className="text-sm font-semibold text-brand-700 hover:underline">Hammasi</Link>} padded={false}>
              {d.recentMilk.length === 0 ? <EmptyState icon={<Milk className="h-6 w-6" />} title="Hali sut yozuvi yo‘q" action={<Button size="sm" onClick={() => navigate('/sut?new=1')}>Sut kiritish</Button>} /> : (
                <div className="overflow-x-auto"><table className="w-full">
                  <thead className="bg-stone-50/60"><tr><th className="th">Sana</th><th className="th">Mol</th><th className="th text-right">Jami</th></tr></thead>
                  <tbody className="divide-y divide-stone-100">{d.recentMilk.map((r) => (
                    <tr key={r.id}><td className="td whitespace-nowrap">{formatDayMonth(r.recordDate)}</td><td className="td">{r.animalName} <span className="text-stone-400">({r.animalTag})</span></td><td className="td text-right font-semibold">{formatLiters(r.totalL)}</td></tr>
                  ))}</tbody></table></div>
              )}
            </Card>
            <Card title="So‘nggi yemish yozuvlari" action={<Link to="/yemish" className="text-sm font-semibold text-brand-700 hover:underline">Hammasi</Link>} padded={false}>
              {d.recentFeed.length === 0 ? <EmptyState icon={<Wheat className="h-6 w-6" />} title="Hali yemish yozuvi yo‘q" action={<Button size="sm" onClick={() => navigate('/yemish?new=1')}>Yemish kiritish</Button>} /> : (
                <div className="overflow-x-auto"><table className="w-full">
                  <thead className="bg-stone-50/60"><tr><th className="th">Sana</th><th className="th">Mol</th><th className="th text-right">Miqdor</th><th className="th hidden text-right sm:table-cell">Narxi</th></tr></thead>
                  <tbody className="divide-y divide-stone-100">{d.recentFeed.map((r) => (
                    <tr key={r.id}><td className="td whitespace-nowrap">{formatDayMonth(r.recordDate)}</td><td className="td">{r.animalName}{r.feedType && <span className="text-stone-400"> · {r.feedType}</span>}</td><td className="td text-right font-semibold">{formatKg(r.quantityKg)}</td><td className="td hidden text-right sm:table-cell">{money(r.totalCost)}</td></tr>
                  ))}</tbody></table></div>
              )}
            </Card>
          </div>
        </div>
      )}
    </>
  );
}

function MiniStat({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="rounded-xl bg-stone-50 px-3 py-2.5">
      <p className="text-xs text-stone-500">{label}</p>
      <p className="mt-0.5 text-base font-bold text-stone-900">{value}</p>
      {note && <p className="text-[11px] text-stone-400">{note}</p>}
    </div>
  );
}

void addDays; void weekRange; void formatNumber;
