import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import type { z } from 'zod';
import { AlertTriangle, ArrowDownRight, ArrowUpRight, Download, Info, Pencil, Plus, ReceiptText, Trash2, TrendingDown, Trophy } from 'lucide-react';
import { api } from '../lib/api';
import { applyApiError, useApp, useMut } from '../lib/app';
import { useFilters, useList, useSort } from '../lib/hooks';
import { downloadCsv } from '../lib/csv';
import { EXPENSE_CATEGORIES, expenseSchema } from '../../shared/schemas';
import { formatDateShort, formatDateUz, formatDayMonth, formatMonthYear, monthRange, parseYmd, weekRange, MONTHS_UZ_SHORT, WEEKDAYS_UZ_SHORT, weekdayIndex } from '../../shared/dates';
import { formatKg, formatLiters, formatNumber, formatPercent } from '../../shared/format';
import type { FinanceTotals } from '../../shared/calc';
import type { Expense, Paged } from '../../shared/types';
import { Badge, Button, Card, ConfirmDialog, EmptyState, ErrorState, Field, FormError, IconButton, Loading, Modal, PageHeader, Pagination, SortTh, StatCard, Tabs } from '../components/ui';
import { DateRange, FilterBar, PeriodPicker, SearchInput, type PeriodMode } from '../components/filters';
import { MoneyChart, SimpleBar } from '../components/charts';

// ------------------------------------------------------------- turlar
interface MilkReport {
  today: string; range: { from: string; to: string }; effectiveTo: string;
  previous: { from: string; to: string; liters: number; changePct: number | null };
  totals: { liters: number; elapsedDays: number; recordDays: number; dailyAverage: number };
  current: { today: number; week: number; month: number; weekRange: { from: string; to: string }; monthRange: { from: string; to: string } };
  daily: { date: string; value: number }[];
  weeks: { from: string; to: string; liters: number; partial: boolean; changePct: number | null }[];
  months: { from: string; to: string; liters: number; partial: boolean; changePct: number | null }[];
  perAnimal: { animalId: number; name: string; tag: string; status: string; liters: number; avgPerDay: number; previousLiters: number; change: number; changePct: number | null; sharePct: number }[];
  top: { animalId: number; name: string; tag: string; liters: number; avgPerDay: number }[];
  decreased: { animalId: number; name: string; tag: string; liters: number; previousLiters: number; change: number; changePct: number | null }[];
}
interface FinanceReport {
  today: string; range: { from: string; to: string };
  totals: FinanceTotals;
  periods: { day: FinanceTotals; week: FinanceTotals; month: FinanceTotals; weekRange: { from: string; to: string }; monthRange: { from: string; to: string } };
  granularity: 'day' | 'month';
  series: { label: string; from: string; to: string; revenueActual: number; revenueEstimated: number; feedCost: number; expenses: number }[];
  perAnimal: { animalId: number; name: string; tag: string; status: string; milkL: number; feedKg: number; feedCost: number; estimatedRevenue: number; difference: number }[];
  expensesByCategory: { category: string; amount: number }[];
}

function Change({ pct }: { pct: number | null }) {
  if (pct === null) return <span className="text-stone-400">—</span>;
  const up = pct >= 0;
  return <span className={`inline-flex items-center gap-0.5 font-semibold ${up ? 'text-brand-700' : 'text-red-600'}`}>{up ? <ArrowUpRight className="h-3.5 w-3.5" /> : <ArrowDownRight className="h-3.5 w-3.5" />}{formatPercent(pct)}</span>;
}

// ------------------------------------------------------------- sut statistikasi
function MilkStats() {
  const { today } = useApp();
  const wk = weekRange(today);
  const [period, setPeriod] = useState<{ mode: PeriodMode; from: string; to: string }>({ mode: 'week', from: wk.from, to: wk.to });
  const q = useList<MilkReport>('report-milk', '/reports/milk', { from: period.from, to: period.to });
  const d = q.data;

  function exportCsv() {
    if (!d) return;
    downloadCsv(`sut-hisoboti_${d.range.from}_${d.range.to}`, ['Mol raqami', 'Mol nomi', 'Sut (L)', 'Kunlik o‘rtacha (L)', 'Ulushi (%)', 'Oldingi davr (L)', 'O‘zgarish (L)', 'O‘zgarish (%)'],
      d.perAnimal.map((a) => [a.tag, a.name, a.liters, a.avgPerDay, a.sharePct, a.previousLiters, a.change, a.changePct]));
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <PeriodPicker mode={period.mode} from={period.from} to={period.to} today={today} onChange={setPeriod} />
        <Button variant="secondary" icon={<Download className="h-4 w-4" />} onClick={exportCsv} disabled={!d}>CSV</Button>
      </div>
      <p className="-mt-2 text-xs text-stone-500">Hafta Dushanbadan Yakshanbagacha hisoblanadi. Hali kelmagan kunlar o‘rtacha va taqqoslashga kiritilmaydi.</p>

      {q.isLoading ? <Loading /> : q.error || !d ? <ErrorState error={q.error} onRetry={() => q.refetch()} /> : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard label="Bugungi sut" value={formatLiters(d.current.today)} />
            <StatCard label="Joriy hafta" value={formatLiters(d.current.week)} hint={`${formatDayMonth(d.current.weekRange.from)} – ${formatDayMonth(d.current.weekRange.to)}`} />
            <StatCard label="Joriy oy" value={formatLiters(d.current.month)} hint={formatMonthYear(d.current.monthRange.from)} />
            <StatCard label="Tanlangan davr jami" value={formatLiters(d.totals.liters)} hint={`${d.totals.recordDays} kunda yozuv bor`} />
            <StatCard label="Kunlik o‘rtacha" value={formatLiters(d.totals.dailyAverage)} hint={`${d.totals.elapsedDays} kun bo‘yicha`} />
            <StatCard label="Oldingi davr" value={formatLiters(d.previous.liters)} hint={`${formatDayMonth(d.previous.from)} – ${formatDayMonth(d.previous.to)}`} />
            <StatCard label="Oldingi davrga nisbatan" value={<Change pct={d.previous.changePct} />} hint={d.previous.liters === 0 ? 'oldingi davrda sut yo‘q' : undefined} />
            <StatCard label="Mollar soni" value={d.perAnimal.filter((a) => a.liters > 0).length} hint="sut bergan" />
          </div>

          <Card title="Kunlik sut — tanlangan davr">
            <SimpleBar data={d.daily.map((p) => ({ label: d.daily.length > 10 ? String(parseYmd(p.date).d) : `${WEEKDAYS_UZ_SHORT[weekdayIndex(p.date)]} ${parseYmd(p.date).d}`, sub: formatDateUz(p.date), value: p.value, highlight: p.date === today }))} />
          </Card>

          <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
            <Card title="Haftalik taqqoslash (oxirgi 8 hafta)">
              <SimpleBar data={d.weeks.map((w) => ({ label: formatDayMonth(w.from), sub: `${formatDateUz(w.from)} — ${formatDateUz(w.to)}${w.partial ? ' (davom etmoqda)' : ''}`, value: w.liters, highlight: w.from <= d.effectiveTo && w.to >= d.effectiveTo }))} height={230} />
              <ul className="mt-3 divide-y divide-stone-100 text-sm">
                {[...d.weeks].reverse().slice(0, 4).map((w) => (
                  <li key={w.from} className="flex items-center justify-between py-1.5"><span className="text-stone-600">{formatDayMonth(w.from)} – {formatDayMonth(w.to)}{w.partial && <span className="text-stone-400"> (davom etmoqda)</span>}</span><span className="flex items-center gap-3"><b>{formatLiters(w.liters)}</b><Change pct={w.changePct} /></span></li>
                ))}
              </ul>
            </Card>
            <Card title="Oylik taqqoslash (oxirgi 6 oy)">
              <SimpleBar data={d.months.map((m) => ({ label: MONTHS_UZ_SHORT[parseYmd(m.from).m - 1], sub: formatMonthYear(m.from) + (m.partial ? ' (davom etmoqda)' : ''), value: m.liters, highlight: m.from <= d.effectiveTo && m.to >= d.effectiveTo }))} height={230} />
              <ul className="mt-3 divide-y divide-stone-100 text-sm">
                {[...d.months].reverse().slice(0, 4).map((m) => (
                  <li key={m.from} className="flex items-center justify-between py-1.5"><span className="text-stone-600">{formatMonthYear(m.from)}{m.partial && <span className="text-stone-400"> (davom etmoqda)</span>}</span><span className="flex items-center gap-3"><b>{formatLiters(m.liters)}</b><Change pct={m.changePct} /></span></li>
                ))}
              </ul>
            </Card>
          </div>

          <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
            <Card title={<span className="flex items-center gap-2"><Trophy className="h-4 w-4 text-amber-500" /> Eng ko‘p sut bergan mollar</span>} padded={false}>
              {d.top.length === 0 ? <EmptyState title="Bu davrda sut yozuvi yo‘q" /> : (
                <ol className="divide-y divide-stone-100">{d.top.map((a, i) => (
                  <li key={a.animalId} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                    <span className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold ${i === 0 ? 'bg-amber-100 text-amber-700' : 'bg-stone-100 text-stone-600'}`}>{i + 1}</span>
                    <span className="flex-1 font-medium text-stone-900">{a.name} <span className="text-stone-400">({a.tag})</span></span>
                    <span className="text-right"><b>{formatLiters(a.liters)}</b><div className="text-xs text-stone-500">kuniga {formatLiters(a.avgPerDay)}</div></span>
                  </li>))}</ol>
              )}
            </Card>
            <Card title={<span className="flex items-center gap-2"><TrendingDown className="h-4 w-4 text-red-500" /> Sut hajmi kamaygan mollar</span>} padded={false}>
              {d.decreased.length === 0 ? <EmptyState title="Kamayish aniqlanmadi" text={d.previous.liters === 0 ? 'Oldingi davrda sut yozuvlari yo‘q — taqqoslab bo‘lmaydi.' : 'Barcha mollar oldingi davr darajasida yoki undan yuqori.'} /> : (
                <ul className="divide-y divide-stone-100">{d.decreased.map((a) => (
                  <li key={a.animalId} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                    <span className="flex-1 font-medium text-stone-900">{a.name} <span className="text-stone-400">({a.tag})</span></span>
                    <span className="text-right text-xs text-stone-500">{formatNumber(a.previousLiters)} → <b className="text-stone-800">{formatNumber(a.liters)} L</b></span>
                    <span className="w-16 text-right text-sm"><Change pct={a.changePct} /></span>
                  </li>))}</ul>
              )}
            </Card>
          </div>

          <Card title="Mollar bo‘yicha sut" padded={false}>
            {d.perAnimal.length === 0 ? <EmptyState title="Ma’lumot yo‘q" /> : (
              <div className="overflow-x-auto"><table className="w-full min-w-[36rem]">
                <thead className="bg-stone-50/60"><tr><th className="th">Mol</th><th className="th text-right">Sut</th><th className="th hidden text-right sm:table-cell">Kuniga</th><th className="th hidden text-right md:table-cell">Ulushi</th><th className="th hidden text-right sm:table-cell">Oldingi davr</th><th className="th text-right">O‘zgarish</th></tr></thead>
                <tbody className="divide-y divide-stone-100">{d.perAnimal.map((a) => (
                  <tr key={a.animalId}><td className="td font-medium text-stone-900">{a.name} <span className="text-stone-400">({a.tag})</span>{a.status === 'inactive' && <span className="ml-1 text-xs text-stone-400">nofaol</span>}</td>
                    <td className="td text-right font-bold">{formatLiters(a.liters)}</td><td className="td hidden text-right sm:table-cell">{formatLiters(a.avgPerDay)}</td>
                    <td className="td hidden text-right md:table-cell">{formatNumber(a.sharePct, 1)}%</td><td className="td hidden text-right sm:table-cell">{formatLiters(a.previousLiters)}</td>
                    <td className="td text-right"><Change pct={a.changePct} /></td></tr>))}</tbody>
                <tfoot className="border-t-2 border-stone-200 bg-stone-50/60"><tr><td className="td font-bold">Jami</td><td className="td text-right font-bold">{formatLiters(d.totals.liters)}</td><td className="td hidden text-right sm:table-cell">{formatLiters(d.totals.dailyAverage)} / kun</td><td className="td hidden md:table-cell" /><td className="td hidden text-right sm:table-cell">{formatLiters(d.previous.liters)}</td><td className="td text-right"><Change pct={d.previous.changePct} /></td></tr></tfoot>
              </table></div>
            )}
          </Card>
        </>
      )}
    </div>
  );
}

// ------------------------------------------------------------- moliya
function Finance() {
  const { today, money } = useApp();
  const mo = monthRange(today);
  const [period, setPeriod] = useState<{ mode: PeriodMode; from: string; to: string }>({ mode: 'month', from: mo.from, to: mo.to });
  const q = useList<FinanceReport>('report-finance', '/reports/finance', { from: period.from, to: period.to });
  const d = q.data;
  const t = d?.totals;
  const estimatedMode = t ? !t.hasSales : false;

  function exportCsv() {
    if (!d) return;
    downloadCsv(`moliya-hisoboti_${d.range.from}_${d.range.to}`, ['Mol raqami', 'Mol nomi', 'Sut (L)', 'Yemish (kg)', 'Yemish xarajati', 'Taxminiy sut daromadi', 'Farq (taxminiy daromad − yemish)'],
      d.perAnimal.map((a) => [a.tag, a.name, a.milkL, a.feedKg, a.feedCost, a.estimatedRevenue, a.difference]));
  }

  const periodRows = d ? [
    { name: 'Bugun', f: d.periods.day, hint: formatDateUz(d.today) },
    { name: 'Shu hafta (Du–Ya)', f: d.periods.week, hint: `${formatDayMonth(d.periods.weekRange.from)} – ${formatDayMonth(d.periods.weekRange.to)}` },
    { name: 'Shu oy', f: d.periods.month, hint: formatMonthYear(d.periods.monthRange.from) },
  ] : [];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <PeriodPicker mode={period.mode} from={period.from} to={period.to} today={today} onChange={setPeriod} />
        <Button variant="secondary" icon={<Download className="h-4 w-4" />} onClick={exportCsv} disabled={!d}>CSV</Button>
      </div>

      {q.isLoading ? <Loading /> : q.error || !d || !t ? <ErrorState error={q.error} onRetry={() => q.refetch()} /> : (
        <>
          {estimatedMode && (t.milkProducedL > 0) && (
            <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
              <div>Bu davrda <b>sut sotuvi kiritilmagan</b>. Daromad ishlab chiqarilgan sutdan har bir kunning sut narxi bo‘yicha hisoblangan va <b>taxminiy</b> hisoblanadi. Aniq natija uchun “Sut sotuvlari” bo‘limida sotuvlarni kiriting.</div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard label="Sotuvdan haqiqiy daromad" value={money(t.actualRevenue)} tone="blue" badge={t.hasSales ? <Badge tone="green">Haqiqiy</Badge> : <Badge tone="gray">sotuv yo‘q</Badge>} hint={t.hasSales ? `${formatLiters(t.milkSoldL)} sotilgan` : undefined} />
            <StatCard label="Taxminiy sut daromadi" value={money(t.estimatedRevenue)} tone="blue" badge={<Badge tone="amber">Taxminiy</Badge>} hint={`${formatLiters(t.milkProducedL)} ishlab chiqarilgan`} />
            <StatCard label="Yemish xarajati" value={money(t.feedCost)} tone="amber" hint={formatKg(t.feedKg)} />
            <StatCard label={estimatedMode ? 'Taxminiy daromad − yemish' : 'Sotuv daromadi − yemish xarajati'} value={money(estimatedMode ? t.balanceEstimated : t.balanceActual)} tone="stone"
              badge={estimatedMode ? <Badge tone="amber">Taxminiy</Badge> : <Badge tone="green">Haqiqiy</Badge>} hint="sof foyda emas" />
          </div>

          {t.hasExpenses && (
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <StatCard label="Qo‘shimcha xarajatlar" value={money(t.additionalExpenses)} tone="amber" icon={<ReceiptText className="h-5 w-5" />} />
              <StatCard label={estimatedMode ? 'Taxminiy daromad − yemish − xarajatlar' : 'Daromad − yemish − qo‘shimcha xarajatlar'} value={money(estimatedMode ? t.balanceAfterExpensesEstimated : t.balanceAfterExpensesActual)} tone="stone"
                badge={estimatedMode ? <Badge tone="amber">Taxminiy</Badge> : undefined} />
            </div>
          )}

          <Card title={`Daromad va xarajatlar dinamikasi (${d.granularity === 'day' ? 'kunlar' : 'oylar'} bo‘yicha)`}
            action={<span className="text-xs text-stone-500">{estimatedMode ? 'Daromad: taxminiy' : 'Daromad: sotuvlar bo‘yicha'}</span>}>
            <MoneyChart currency="so‘m" data={d.series.map((s) => ({
              label: d.granularity === 'day' ? (d.series.length > 14 ? String(parseYmd(s.label).d) : formatDayMonth(s.label)) : MONTHS_UZ_SHORT[parseYmd(s.label).m - 1],
              sub: d.granularity === 'day' ? formatDateUz(s.label) : formatMonthYear(s.label),
              revenue: estimatedMode ? s.revenueEstimated : s.revenueActual, revenueName: estimatedMode ? 'Taxminiy daromad' : 'Sotuv daromadi', feedCost: s.feedCost, expenses: s.expenses,
            }))} />
          </Card>

          <Card title="Kunlik, haftalik va oylik ko‘rsatkichlar" padded={false}>
            <div className="overflow-x-auto"><table className="w-full min-w-[40rem]">
              <thead className="bg-stone-50/60"><tr><th className="th">Davr</th><th className="th text-right">Sotuv daromadi</th><th className="th text-right">Taxminiy daromad</th><th className="th text-right">Yemish xarajati</th><th className="th text-right">Sotuv − yemish</th><th className="th text-right">Taxminiy − yemish</th></tr></thead>
              <tbody className="divide-y divide-stone-100">{periodRows.map((r) => (
                <tr key={r.name}><td className="td"><div className="font-semibold text-stone-900">{r.name}</div><div className="text-xs text-stone-400">{r.hint}</div></td>
                  <td className="td text-right">{r.f.hasSales ? money(r.f.actualRevenue) : <span className="text-stone-400">sotuv yo‘q</span>}</td>
                  <td className="td text-right">{money(r.f.estimatedRevenue)}</td><td className="td text-right">{money(r.f.feedCost)}</td>
                  <td className="td text-right font-semibold">{r.f.hasSales ? money(r.f.balanceActual) : '—'}</td><td className="td text-right font-semibold text-stone-600">{money(r.f.balanceEstimated)}</td></tr>))}</tbody>
            </table></div>
          </Card>

          <div className="space-y-5">
            <Card title="Mollar bo‘yicha moliyaviy ko‘rsatkichlar" padded={false}
              action={<span className="flex items-center gap-1 text-xs text-stone-500"><Info className="h-3.5 w-3.5" /> sotuvlar molga bog‘lanmagan — daromad taxminiy</span>}>
              {d.perAnimal.length === 0 ? <EmptyState title="Bu davrda ma’lumot yo‘q" /> : (
                <div className="overflow-x-auto"><table className="w-full min-w-[38rem]">
                  <thead className="bg-stone-50/60"><tr><th className="th">Mol</th><th className="th text-right">Sut</th><th className="th text-right">Yemish</th><th className="th text-right">Yemish xarajati</th><th className="th text-right">Taxminiy daromad</th><th className="th text-right">Farq</th></tr></thead>
                  <tbody className="divide-y divide-stone-100">{d.perAnimal.map((a) => (
                    <tr key={a.animalId}><td className="td font-medium text-stone-900">{a.name} <span className="text-stone-400">({a.tag})</span></td><td className="td text-right">{formatLiters(a.milkL)}</td><td className="td text-right">{formatKg(a.feedKg)}</td>
                      <td className="td text-right">{money(a.feedCost)}</td><td className="td text-right">{money(a.estimatedRevenue)}</td><td className={`td text-right font-semibold ${a.difference < 0 ? 'text-red-600' : 'text-brand-700'}`}>{money(a.difference)}</td></tr>))}</tbody>
                </table></div>
              )}
            </Card>
            {d.expensesByCategory.length > 0 && (<Card title="Qo‘shimcha xarajatlar turlari" padded={false}>
              {(
                <ul className="divide-y divide-stone-100">{d.expensesByCategory.map((c) => <li key={c.category} className="flex items-center justify-between px-4 py-2.5 text-sm"><span>{c.category}</span><b>{money(c.amount)}</b></li>)}</ul>
              )}
            </Card>)}
          </div>

          <Card title="Hisoblash qoidalari" className="text-sm text-stone-600">
            <ul className="list-disc space-y-1 pl-5">
              <li><b>Sotuv daromadi</b> = sotilgan sut (L) × sotuv yozuvidagi narx. <b>Taxminiy daromad</b> = ishlab chiqarilgan sut × o‘sha kunda amal qilgan narx.</li>
              <li><b>Yemish xarajati</b> = haqiqiy sarflangan yemish (kg) × yozuvdagi narx. Narx o‘zgarsa, eski yozuvlar o‘zgarmaydi.</li>
              <li>“Daromad − yemish” <b>sof foyda emas</b>: boshqa xarajatlar ham bo‘lishi mumkin; kiritilgan qo‘shimcha xarajatlar alohida ayriladi.</li>
            </ul>
          </Card>
        </>
      )}
    </div>
  );
}

// ------------------------------------------------------------- xarajatlar
type ExpIn = z.input<typeof expenseSchema>;
const fmtInput = (n: number) => (n ? String(n).replace('.', ',') : '');

function ExpenseModal({ open, onClose, expense }: { open: boolean; onClose: () => void; expense: Expense | null }) {
  const { today } = useApp();
  const [formError, setFormError] = useState('');
  const { register, handleSubmit, reset, setError, formState: { errors } } = useForm<ExpIn, unknown, z.output<typeof expenseSchema>>({ resolver: zodResolver(expenseSchema) });
  useEffect(() => {
    if (!open) return;
    setFormError('');
    reset(expense ? { expenseDate: expense.expenseDate, category: expense.category, amount: fmtInput(expense.amount), description: expense.description ?? '' } : { expenseDate: today, category: EXPENSE_CATEGORIES[0], amount: '', description: '' });
  }, [open, expense, reset, today]);
  const save = useMut((v: z.output<typeof expenseSchema>) => (expense ? api.put<Expense>(`/expenses/${expense.id}`, v) : api.post<Expense>('/expenses', v)),
    { success: expense ? 'Xarajat yangilandi' : 'Xarajat saqlandi', silentError: true, onSuccess: onClose });
  const submit = handleSubmit((v) => { setFormError(''); save.mutate(v, { onError: (e) => { if (!applyApiError(e, setError)) setFormError(e instanceof Error ? e.message : 'Xatolik'); } }); }, () => setFormError('Iltimos, qizil bilan ko‘rsatilgan maydonlarni to‘g‘rilang.'));
  const err = (k: keyof ExpIn) => errors[k]?.message as string | undefined;
  return (
    <Modal open={open} onClose={onClose} title={expense ? 'Xarajatni tahrirlash' : 'Qo‘shimcha xarajat kiritish'}
      footer={<><Button variant="secondary" onClick={onClose}>Bekor qilish</Button><Button loading={save.isPending} onClick={submit}>Saqlash</Button></>}>
      <form onSubmit={submit} noValidate className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2"><FormError message={formError} /></div>
        <Field label="Sana" required error={err('expenseDate')}><input type="date" className="input" {...register('expenseDate')} /></Field>
        <Field label="Summa (so‘m)" required error={err('amount')}><input inputMode="decimal" autoFocus className={`input ${err('amount') ? 'input-error' : ''}`} placeholder="0" {...register('amount')} /></Field>
        <Field label="Xarajat turi" required error={err('category')} className="sm:col-span-2">
          <input className={`input ${err('category') ? 'input-error' : ''}`} list="expense-cats" {...register('category')} />
          <datalist id="expense-cats">{EXPENSE_CATEGORIES.map((c) => <option key={c} value={c} />)}</datalist>
        </Field>
        <Field label="Izoh (ixtiyoriy)" error={err('description')} className="sm:col-span-2"><textarea rows={2} className="input" {...register('description')} /></Field>
      </form>
    </Modal>
  );
}

function Expenses() {
  const { today, money } = useApp();
  const mo = monthRange(today);
  const { filters, patch, page, setPage } = useFilters({ from: mo.from, to: today, search: '' });
  const { sort, dir, onSort } = useSort('date', 'desc');
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Expense | null>(null);
  const [deleting, setDeleting] = useState<Expense | null>(null);
  const q = useList<Paged<Expense> & { sumAmount: number }>('expenses', '/expenses', { ...filters, sort, dir, page, pageSize: 15 });
  const remove = useMut((id: number) => api.del(`/expenses/${id}`), { success: 'Xarajat o‘chirildi', onSuccess: () => setDeleting(null) });
  const d = q.data;
  const openNew = () => { setEditing(null); setFormOpen(true); };

  async function exportCsv() {
    const all = await api.get<Paged<Expense>>('/expenses', { ...filters, sort, dir, pageSize: 'all' });
    downloadCsv(`xarajatlar_${filters.from}_${filters.to}`, ['Sana', 'Turi', 'Summa', 'Izoh'], all.rows.map((r) => [r.expenseDate, r.category, r.amount, r.description]));
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-xl text-sm text-stone-500">Veterinariya, dori-darmon, ish haqi va boshqa xarajatlar. Ular “yemish xarajati”dan alohida hisoblanadi.</p>
        <Button icon={<Plus className="h-4 w-4" />} onClick={openNew}>Xarajat kiritish</Button>
      </div>
      <FilterBar>
        <DateRange from={filters.from} to={filters.to} today={today} onChange={(r) => patch(r)} />
        <SearchInput className="min-w-[10rem] flex-1" value={filters.search} onChange={(v) => patch({ search: v })} placeholder="Tur yoki izoh" />
        <Button variant="secondary" icon={<Download className="h-4 w-4" />} onClick={exportCsv}>CSV</Button>
      </FilterBar>
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Jami qo‘shimcha xarajat" value={money(d?.sumAmount ?? 0)} tone="amber" icon={<ReceiptText className="h-5 w-5" />} />
        <StatCard label="Yozuvlar soni" value={d?.total ?? 0} />
      </div>
      <Card padded={false}>
        {q.isLoading ? <Loading /> : q.error ? <ErrorState error={q.error} onRetry={() => q.refetch()} /> : !d || d.rows.length === 0 ? (
          <EmptyState icon={<ReceiptText className="h-6 w-6" />} title="Xarajat yozuvlari yo‘q" text="Bu ixtiyoriy bo‘lim: xarajat kiritsangiz, hisobotlarda “yemish va qo‘shimcha xarajatlardan keyin” ko‘rsatkichi paydo bo‘ladi." action={<Button icon={<Plus className="h-4 w-4" />} onClick={openNew}>Xarajat kiritish</Button>} />
        ) : (
          <>
            <div className="overflow-x-auto"><table className="w-full min-w-[30rem]">
              <thead className="border-b border-stone-100 bg-stone-50/60"><tr>
                <SortTh label="Sana" field="date" sort={sort} dir={dir} onSort={onSort} />
                <SortTh label="Turi" field="category" sort={sort} dir={dir} onSort={onSort} />
                <SortTh label="Summa" field="amount" sort={sort} dir={dir} onSort={onSort} className="text-right" />
                <th className="th hidden md:table-cell">Izoh</th><th className="th text-right">Amallar</th></tr></thead>
              <tbody className="divide-y divide-stone-100">{d.rows.map((r) => (
                <tr key={r.id} className="hover:bg-stone-50/70"><td className="td whitespace-nowrap">{formatDateShort(r.expenseDate)}</td><td className="td font-medium text-stone-900">{r.category}</td>
                  <td className="td text-right font-bold">{money(r.amount)}</td><td className="td hidden max-w-xs truncate md:table-cell">{r.description || '—'}</td>
                  <td className="td"><div className="flex justify-end"><IconButton label="Tahrirlash" onClick={() => { setEditing(r); setFormOpen(true); }}><Pencil className="h-4 w-4" /></IconButton>
                    <IconButton label="O‘chirish" className="hover:!bg-red-50 hover:!text-red-600" onClick={() => setDeleting(r)}><Trash2 className="h-4 w-4" /></IconButton></div></td></tr>))}</tbody>
            </table></div>
            <Pagination page={d.page} totalPages={d.totalPages} total={d.total} pageSize={d.pageSize} onPage={setPage} />
          </>
        )}
      </Card>
      <ExpenseModal open={formOpen} onClose={() => setFormOpen(false)} expense={editing} />
      <ConfirmDialog open={!!deleting} title="Xarajatni o‘chirish" loading={remove.isPending}
        message={deleting && <>{formatDateUz(deleting.expenseDate)} sanadagi “{deleting.category}” xarajatini ({money(deleting.amount)}) o‘chirmoqchimisiz?</>}
        onCancel={() => setDeleting(null)} onConfirm={() => deleting && remove.mutate(deleting.id)} />
    </div>
  );
}

// ------------------------------------------------------------------ sahifa
type Tab = 'sut' | 'moliya' | 'xarajat';
export function Reports() {
  const [params, setParams] = useSearchParams();
  const tab = (['sut', 'moliya', 'xarajat'].includes(params.get('tab') ?? '') ? params.get('tab') : 'sut') as Tab;
  const setTab = (t: Tab) => setParams({ tab: t }, { replace: true });
  return (
    <>
      <PageHeader title="Hisobotlar" subtitle="Barcha hisobotlar yozuvlar qo‘shilganda, tahrirlanganda yoki o‘chirilganda avtomatik yangilanadi" />
      <Tabs value={tab} onChange={setTab} tabs={[{ id: 'sut', label: 'Sut statistikasi' }, { id: 'moliya', label: 'Moliyaviy hisobot' }, { id: 'xarajat', label: 'Qo‘shimcha xarajatlar' }]} />
      {tab === 'sut' ? <MilkStats /> : tab === 'moliya' ? <Finance /> : <Expenses />}
    </>
  );
}
