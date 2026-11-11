import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import type { z } from 'zod';
import { useQuery } from '@tanstack/react-query';
import { Database, LogOut, Milk, Trash2, Wheat } from 'lucide-react';
import { api, getToken, setToken } from '../lib/api';
import { applyApiError, useApp, useMut } from '../lib/app';
import { priceSchema, settingsSchema } from '../../shared/schemas';
import { formatDateUz } from '../../shared/dates';
import { formatNumber } from '../../shared/format';
import type { PriceKind, PriceRow, Settings } from '../../shared/types';
import { Badge, Button, Card, ConfirmDialog, Field, FormError, IconButton, PageHeader } from '../components/ui';

const fmtInput = (n: number) => (n ? String(n).replace('.', ',') : '');
type PriceIn = z.input<typeof priceSchema>;

function PriceCard({ kind }: { kind: PriceKind }) {
  const { settings, today } = useApp();
  const current = kind === 'milk' ? settings.milkPrice : settings.feedPrice;
  const title = kind === 'milk' ? 'Sut sotish narxi (1 litr)' : 'Yemish narxi (1 kg)';
  const [formError, setFormError] = useState('');
  const { register, handleSubmit, reset, setError, formState: { errors } } = useForm<PriceIn, unknown, z.output<typeof priceSchema>>({
    resolver: zodResolver(priceSchema), defaultValues: { kind, price: fmtInput(current), effectiveFrom: today },
  });
  useEffect(() => { reset({ kind, price: fmtInput(current), effectiveFrom: today }); }, [current, today, kind, reset]);
  const save = useMut((v: z.output<typeof priceSchema>) => api.post<Settings>('/prices', v), { success: 'Narx saqlandi — eski yozuvlar o‘zgarmadi', silentError: true });
  const submit = handleSubmit((v) => { setFormError(''); save.mutate(v, { onError: (e) => { if (!applyApiError(e, setError)) setFormError(e instanceof Error ? e.message : 'Xatolik'); } }); });
  const err = (k: keyof PriceIn) => errors[k]?.message as string | undefined;
  return (
    <Card title={<span className="flex items-center gap-2">{kind === 'milk' ? <Milk className="h-4 w-4 text-sky-600" /> : <Wheat className="h-4 w-4 text-amber-600" />}{title}</span>}>
      <div className="mb-4 flex items-baseline gap-2">
        <span className="text-3xl font-bold tracking-tight text-stone-900">{formatNumber(current, 2)}</span>
        <span className="text-sm text-stone-500">{settings.currencyLabel} — hozir amalda</span>
      </div>
      {current === 0 && <p className="mb-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">Narx hali kiritilmagan. Daromad va xarajatlar to‘g‘ri hisoblanishi uchun kiriting.</p>}
      <form onSubmit={submit} noValidate className="grid gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2"><FormError message={formError} /></div>
        <input type="hidden" {...register('kind')} />
        <Field label="Yangi narx" error={err('price')}><input inputMode="decimal" className={`input ${err('price') ? 'input-error' : ''}`} {...register('price')} /></Field>
        <Field label="Amal qilish sanasi" error={err('effectiveFrom')} hint="O‘tgan sanani ham tanlash mumkin"><input type="date" className="input" {...register('effectiveFrom')} /></Field>
        <div className="sm:col-span-2"><Button type="submit" loading={save.isPending}>Narxni saqlash</Button></div>
      </form>
    </Card>
  );
}

export function SettingsPage() {
  const { settings } = useApp();
  const health = useQuery({ queryKey: ['health'], queryFn: () => api.get<{ db: string; authRequired: boolean }>('/health') });
  const [delPrice, setDelPrice] = useState<PriceRow | null>(null);
  const [formError, setFormError] = useState('');
  const { register, handleSubmit, reset, setError, formState: { errors } } = useForm<z.input<typeof settingsSchema>, unknown, z.output<typeof settingsSchema>>({
    resolver: zodResolver(settingsSchema), defaultValues: { farmName: settings.farmName, currencyLabel: settings.currencyLabel },
  });
  useEffect(() => { reset({ farmName: settings.farmName, currencyLabel: settings.currencyLabel }); }, [settings, reset]);
  const save = useMut((v: z.output<typeof settingsSchema>) => api.put<Settings>('/settings', v), { success: 'Sozlamalar saqlandi', silentError: true });
  const submit = handleSubmit((v) => { setFormError(''); save.mutate(v, { onError: (e) => { if (!applyApiError(e, setError)) setFormError(e instanceof Error ? e.message : 'Xatolik'); } }); });
  const delMut = useMut((id: number) => api.del<Settings>(`/prices/${id}`), { success: 'Narx tarixdan o‘chirildi', onSuccess: () => setDelPrice(null) });

  const mode = health.data?.db;
  const history = [...settings.priceHistory].sort((a, b) => (a.effectiveFrom < b.effectiveFrom ? 1 : -1));

  return (
    <>
      <PageHeader title="Narxlar va sozlamalar" subtitle="Narxlarni istalgan vaqtda o‘zgartirish mumkin — saqlangan sotuv va yemish yozuvlari o‘z narxini saqlab qoladi" />
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <PriceCard kind="milk" />
        <PriceCard kind="feed" />

        <Card title="Narxlar tarixi" className="lg:col-span-2" padded={false}>
          <div className="overflow-x-auto"><table className="w-full min-w-[28rem]">
            <thead className="bg-stone-50/60"><tr><th className="th">Amal qila boshlagan sana</th><th className="th">Turi</th><th className="th text-right">Narx</th><th className="th text-right">Amal</th></tr></thead>
            <tbody className="divide-y divide-stone-100">{history.map((p) => (
              <tr key={p.id}>
                <td className="td">{p.effectiveFrom === '2000-01-01' ? 'Boshidan' : formatDateUz(p.effectiveFrom)}</td>
                <td className="td">{p.kind === 'milk' ? <Badge tone="blue">Sut (1 L)</Badge> : <Badge tone="amber">Yemish (1 kg)</Badge>}</td>
                <td className="td text-right font-semibold">{formatNumber(p.price, 2)} {settings.currencyLabel}</td>
                <td className="td text-right">{p.effectiveFrom !== '2000-01-01' && <IconButton label="Tarixdan o‘chirish" className="hover:!bg-red-50 hover:!text-red-600" onClick={() => setDelPrice(p)}><Trash2 className="h-4 w-4" /></IconButton>}</td>
              </tr>))}</tbody>
          </table></div>
          <p className="border-t border-stone-100 px-4 py-3 text-xs text-stone-500">Narx tarixi taxminiy daromadni hisoblashda va yangi yozuvga narx taklif qilishda ishlatiladi. Sotuv va yemish yozuvlarining o‘z narxi ularning ichida saqlanadi va bu yerdan o‘zgarmaydi.</p>
        </Card>

        <Card title="Ferma sozlamalari">
          <form onSubmit={submit} noValidate className="grid gap-4">
            <FormError message={formError} />
            <Field label="Ferma nomi" required error={errors.farmName?.message}><input className={`input ${errors.farmName ? 'input-error' : ''}`} {...register('farmName')} /></Field>
            <Field label="Valyuta ko‘rinishi" error={errors.currencyLabel?.message} hint="Faqat ko‘rinish; hisob-kitoblar o‘zbek so‘mida">
              <select className="input" {...register('currencyLabel')}><option value="so'm">so‘m (so'm)</option><option value="UZS">UZS</option></select>
            </Field>
            <div className="text-sm text-stone-500">Vaqt mintaqasi: <b className="text-stone-700">{settings.timezone}</b> · Hafta: Dushanba–Yakshanba · Birliklar: litr (L), kilogramm (kg)</div>
            <div><Button type="submit" loading={save.isPending}>Saqlash</Button></div>
          </form>
        </Card>

        <Card title={<span className="flex items-center gap-2"><Database className="h-4 w-4 text-stone-500" /> Ma’lumotlar saqlanishi</span>}>
          {!mode ? <p className="text-sm text-stone-500">Yuklanmoqda…</p> : mode === 'postgres' ? (
            <div className="space-y-2 text-sm text-stone-600">
              <Badge tone="green">PostgreSQL (Supabase) ulangan</Badge>
              <p>Barcha ma’lumotlar serverdagi PostgreSQL bazasida doimiy saqlanadi. Sahifani yangilasangiz yoki boshqa qurilmadan kirsangiz, yozuvlar yo‘qolmaydi.</p>
            </div>
          ) : (
            <div className="space-y-2 text-sm text-stone-600">
              <Badge tone="amber">Mahalliy rejim</Badge>
              <p>Ma’lumotlar <b>shu server/kompyuter diskidagi</b> PostgreSQL bazasida (PGlite) saqlanadi — brauzer xotirasida emas, sahifani yangilash yoki brauzerni yopish ma’lumotni o‘chirmaydi.</p>
              <p>Boshqa qurilmalardan foydalanish va xavfsiz zaxira uchun <code className="rounded bg-stone-100 px-1">DATABASE_URL</code> orqali Supabase (PostgreSQL) ga ulang — README.md’ga qarang.</p>
            </div>
          )}
          {health.data && !health.data.authRequired && <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">Parol o‘rnatilmagan (APP_PASSWORD). Internetga chiqarishdan oldin parol qo‘ying.</p>}
          {getToken() && <Button className="mt-4" variant="secondary" icon={<LogOut className="h-4 w-4" />} onClick={() => { setToken(null); window.dispatchEvent(new Event('ferma:auth-required')); }}>Tizimdan chiqish</Button>}
        </Card>
      </div>

      <ConfirmDialog open={!!delPrice} title="Narxni tarixdan o‘chirish" loading={delMut.isPending}
        message={delPrice && <>{formatDateUz(delPrice.effectiveFrom)} sanadan amal qiluvchi {formatNumber(delPrice.price)} {settings.currencyLabel} narxini tarixdan o‘chirmoqchimisiz? Saqlangan sotuv va yemish yozuvlari o‘zgarmaydi, lekin taxminiy daromad hisobi o‘zgarishi mumkin.</>}
        onCancel={() => setDelPrice(null)} onConfirm={() => delPrice && delMut.mutate(delPrice.id)} />
    </>
  );
}
