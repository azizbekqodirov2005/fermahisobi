import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import type { z } from 'zod';
import { Eye, PawPrint, Pencil, Plus, Trash2 } from 'lucide-react';
import { api, ApiError } from '../lib/api';
import { applyApiError, useApp, useMut } from '../lib/app';
import { useFilters, useList, useSort, type AnimalPage } from '../lib/hooks';
import { animalSchema } from '../../shared/schemas';
import { formatAge, formatKg } from '../../shared/format';
import { formatDateUz } from '../../shared/dates';
import type { Animal } from '../../shared/types';
import { Badge, Button, Card, ConfirmDialog, EmptyState, ErrorState, Field, FormError, IconButton, Loading, Modal, PageHeader, Pagination, SortTh } from '../components/ui';
import { FilterBar, SearchInput } from '../components/filters';

type FormIn = z.input<typeof animalSchema>;

export function AnimalFormModal({ open, onClose, animal }: { open: boolean; onClose: () => void; animal?: Animal | null }) {
  const { today } = useApp();
  const [ageMode, setAgeMode] = useState<'birth' | 'manual'>('birth');
  const [formError, setFormError] = useState('');
  const { register, handleSubmit, reset, setError, formState: { errors } } = useForm<FormIn, unknown, z.output<typeof animalSchema>>({ resolver: zodResolver(animalSchema) });

  useEffect(() => {
    if (!open) return;
    setFormError('');
    if (animal) {
      const manual = !animal.birthDate;
      setAgeMode(manual ? 'manual' : 'birth');
      reset({
        tagNumber: animal.tagNumber, name: animal.name, birthDate: animal.birthDate ?? '',
        ageYears: manual ? String(animal.age?.years ?? '') : '', ageMonths: manual ? String(animal.age?.months ?? '') : '',
        dailyFeedKg: String(animal.dailyFeedKg), notes: animal.notes ?? '', status: animal.status, dateAdded: animal.dateAdded,
      });
    } else {
      setAgeMode('birth');
      reset({ tagNumber: '', name: '', birthDate: '', ageYears: '', ageMonths: '', dailyFeedKg: '', notes: '', status: 'active', dateAdded: today });
    }
  }, [open, animal, reset, today]);

  const save = useMut(
    (v: z.output<typeof animalSchema>) => (animal ? api.put<Animal>(`/animals/${animal.id}`, v) : api.post<Animal>('/animals', v)),
    { success: animal ? 'Mol ma’lumotlari saqlandi' : 'Yangi mol qo‘shildi', silentError: true, onSuccess: onClose },
  );

  const submit = handleSubmit((v) => {
    setFormError('');
    const payload = { ...v, ...(ageMode === 'birth' ? { ageYears: undefined, ageMonths: undefined } : { birthDate: null }) };
    save.mutate(payload as z.output<typeof animalSchema>, {
      onError: (e) => { if (!applyApiError(e, setError)) setFormError(e instanceof Error ? e.message : 'Xatolik'); else if (e instanceof ApiError) setFormError(e.message); },
    });
  }, () => setFormError('Iltimos, qizil bilan ko‘rsatilgan maydonlarni to‘g‘rilang.'));

  const err = (k: keyof FormIn) => errors[k]?.message as string | undefined;
  return (
    <Modal open={open} onClose={onClose} title={animal ? 'Molni tahrirlash' : 'Yangi mol qo‘shish'} size="lg"
      footer={<>
        <Button variant="secondary" onClick={onClose}>Bekor qilish</Button>
        <Button loading={save.isPending} onClick={submit}>{animal ? 'Saqlash' : 'Qo‘shish'}</Button>
      </>}>
      <form onSubmit={submit} noValidate className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2"><FormError message={formError} /></div>
        <Field label="Mol raqami (birka)" required error={err('tagNumber')}>
          <input className={`input ${err('tagNumber') ? 'input-error' : ''}`} placeholder="Masalan: 101" autoFocus {...register('tagNumber')} />
        </Field>
        <Field label="Mol nomi (laqabi)" required error={err('name')}>
          <input className={`input ${err('name') ? 'input-error' : ''}`} placeholder="Masalan: Boychechak" {...register('name')} />
        </Field>

        <div className="sm:col-span-2">
          <div className="mb-2 flex gap-4 text-sm">
            <label className="flex cursor-pointer items-center gap-2"><input type="radio" checked={ageMode === 'birth'} onChange={() => setAgeMode('birth')} className="accent-brand-600" /> Tug‘ilgan sana ma’lum</label>
            <label className="flex cursor-pointer items-center gap-2"><input type="radio" checked={ageMode === 'manual'} onChange={() => setAgeMode('manual')} className="accent-brand-600" /> Yoshini o‘zim kiritaman</label>
          </div>
          {ageMode === 'birth' ? (
            <Field label="Tug‘ilgan sana" error={err('birthDate')} hint="Yosh avtomatik hisoblanadi va vaqt o‘tishi bilan yangilanib boradi.">
              <input type="date" max={today} className={`input ${err('birthDate') ? 'input-error' : ''}`} {...register('birthDate')} />
            </Field>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <Field label="Yosh (yil)" error={err('ageYears')}><input inputMode="numeric" className={`input ${err('ageYears') ? 'input-error' : ''}`} placeholder="0" {...register('ageYears')} /></Field>
              <Field label="Oy (0–11)" error={err('ageMonths') ?? err('birthDate')}><input inputMode="numeric" className={`input ${err('ageMonths') ? 'input-error' : ''}`} placeholder="0" {...register('ageMonths')} /></Field>
            </div>
          )}
        </div>

        <Field label="Kunlik yemish miqdori (kg)" error={err('dailyFeedKg')} hint="Standart miqdor. Yemish kiritishda har kuni o‘zgartirish mumkin.">
          <input inputMode="decimal" className={`input ${err('dailyFeedKg') ? 'input-error' : ''}`} placeholder="Masalan: 12,5" {...register('dailyFeedKg')} />
        </Field>
        <Field label="Qo‘shilgan sana" error={err('dateAdded')}>
          <input type="date" className="input" {...register('dateAdded')} />
        </Field>
        {animal && (
          <Field label="Holati">
            <select className="input" {...register('status')}><option value="active">Faol</option><option value="inactive">Nofaol</option></select>
          </Field>
        )}
        <Field label="Izoh (ixtiyoriy)" error={err('notes')} className="sm:col-span-2">
          <textarea rows={2} className="input" placeholder="Masalan: sog‘lig‘i, zoti, boshqa ma’lumotlar" {...register('notes')} />
        </Field>
      </form>
    </Modal>
  );
}

export function Animals() {
  const [params, setParams] = useSearchParams();
  const { filters, patch, page, setPage } = useFilters({ search: '', status: 'all' });
  const { sort, dir, onSort, setSort, setDir } = useSort('tag', 'asc');
  const [editing, setEditing] = useState<Animal | null>(null);
  const [formOpen, setFormOpen] = useState(params.get('new') === '1');
  const [deleting, setDeleting] = useState<Animal | null>(null);

  useEffect(() => { if (params.get('new') === '1') { setFormOpen(true); setParams({}, { replace: true }); } }, [params, setParams]);

  const q = useList<AnimalPage>('animals', '/animals', { ...filters, sort, dir, page, pageSize: 15 });
  const remove = useMut((id: number) => api.del(`/animals/${id}`), { success: 'Mol o‘chirildi', onSuccess: () => setDeleting(null), silentError: true });
  const toggle = useMut((a: Animal) => api.patch<Animal>(`/animals/${a.id}/status`, { status: a.status === 'active' ? 'inactive' : 'active' }), {
    success: (a) => (a.status === 'active' ? 'Mol faollashtirildi' : 'Mol nofaol qilindi — tarixiy yozuvlar saqlanib qoladi'),
  });
  const [delError, setDelError] = useState('');

  const openNew = () => { setEditing(null); setFormOpen(true); };
  const data = q.data;

  return (
    <>
      <PageHeader title="Mollar" subtitle={data ? `Faol mollar: ${data.activeCount}${data.inactiveCount ? ` · Nofaol: ${data.inactiveCount}` : ''}` : undefined}
        actions={<Button icon={<Plus className="h-4 w-4" />} onClick={openNew}>Mol qo‘shish</Button>} />

      <FilterBar>
        <SearchInput className="min-w-[14rem] flex-1" value={filters.search} onChange={(v) => patch({ search: v })} placeholder="Nomi yoki raqami bo‘yicha qidirish" />
        <label className="text-xs font-medium text-stone-500">Holati
          <select className="input mt-0.5 w-36" value={filters.status} onChange={(e) => patch({ status: e.target.value })}>
            <option value="all">Barchasi</option><option value="active">Faol</option><option value="inactive">Nofaol</option>
          </select>
        </label>
        <label className="text-xs font-medium text-stone-500">Saralash
          <select className="input mt-0.5 w-44" value={`${sort}:${dir}`} onChange={(e) => { const [s, d] = e.target.value.split(':'); setSort(s); setDir(d as 'asc' | 'desc'); setPage(1); }}>
            <option value="tag:asc">Raqami (o‘sish)</option><option value="tag:desc">Raqami (kamayish)</option>
            <option value="name:asc">Nomi (A–Z)</option><option value="name:desc">Nomi (Z–A)</option>
            <option value="age:asc">Yoshi (kichigi avval)</option><option value="age:desc">Yoshi (kattasi avval)</option>
            <option value="feed:desc">Yemish (ko‘p)</option><option value="feed:asc">Yemish (kam)</option>
            <option value="added:desc">Qo‘shilgan (yangi)</option>
          </select>
        </label>
      </FilterBar>

      <Card padded={false}>
        {q.isLoading ? <Loading /> : q.error ? <ErrorState error={q.error} onRetry={() => q.refetch()} /> : !data || data.rows.length === 0 ? (
          filters.search || filters.status !== 'all'
            ? <EmptyState icon={<PawPrint className="h-6 w-6" />} title="Hech narsa topilmadi" text="Qidiruv yoki filtrni o‘zgartirib ko‘ring." />
            : <EmptyState icon={<PawPrint className="h-6 w-6" />} title="Hali mol qo‘shilmagan" text="Boshlash uchun birinchi molingizni qo‘shing. Sut va yemish hisobi shu mollarga bog‘lanadi." action={<Button icon={<Plus className="h-4 w-4" />} onClick={openNew}>Mol qo‘shish</Button>} />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[34rem]">
                <thead className="border-b border-stone-100 bg-stone-50/60">
                  <tr>
                    <SortTh label="Raqami" field="tag" sort={sort} dir={dir} onSort={onSort} />
                    <SortTh label="Nomi" field="name" sort={sort} dir={dir} onSort={onSort} />
                    <SortTh label="Yoshi" field="age" sort={sort} dir={dir} onSort={onSort} className="hidden sm:table-cell" />
                    <SortTh label="Yemish/kun" field="feed" sort={sort} dir={dir} onSort={onSort} className="hidden md:table-cell" />
                    <th className="th hidden lg:table-cell">Qo‘shilgan</th>
                    <th className="th">Holati</th>
                    <th className="th text-right">Amallar</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100">
                  {data.rows.map((a) => (
                    <tr key={a.id} className="hover:bg-stone-50/70">
                      <td className="td font-semibold text-stone-900">{a.tagNumber}</td>
                      <td className="td"><Link to={`/mollar/${a.id}`} className="font-medium text-brand-700 hover:underline">{a.name}</Link></td>
                      <td className="td hidden sm:table-cell">{formatAge(a.age)}</td>
                      <td className="td hidden md:table-cell">{formatKg(a.dailyFeedKg)}</td>
                      <td className="td hidden lg:table-cell">{formatDateUz(a.dateAdded)}</td>
                      <td className="td"><Badge tone={a.status === 'active' ? 'green' : 'gray'}>{a.status === 'active' ? 'Faol' : 'Nofaol'}</Badge></td>
                      <td className="td">
                        <div className="flex justify-end">
                          <Link to={`/mollar/${a.id}`} aria-label="Ko‘rish" title="Ko‘rish" className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-stone-500 hover:bg-stone-100 hover:text-stone-800"><Eye className="h-4 w-4" /></Link>
                          <IconButton label="Tahrirlash" onClick={() => { setEditing(a); setFormOpen(true); }}><Pencil className="h-4 w-4" /></IconButton>
                          <IconButton label="O‘chirish" className="hover:!bg-red-50 hover:!text-red-600" onClick={() => { setDelError(''); setDeleting(a); }}><Trash2 className="h-4 w-4" /></IconButton>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination page={data.page} totalPages={data.totalPages} total={data.total} pageSize={data.pageSize} onPage={setPage} />
          </>
        )}
      </Card>

      <AnimalFormModal open={formOpen} onClose={() => setFormOpen(false)} animal={editing} />

      {deleting?.hasHistory ? (
        <ConfirmDialog
          open
          danger={false}
          title="Molni o‘chirib bo‘lmaydi"
          loading={toggle.isPending}
          cancelLabel="Yopish"
          confirmLabel={deleting.status === 'active' ? 'Nofaol qilish' : 'Tushunarli'}
          message={<><b>{deleting.name}</b> ({deleting.tagNumber}) uchun sut yoki yemish yozuvlari mavjud. Tarixiy ma’lumotlar yo‘qolmasligi uchun bunday molni o‘chirib bo‘lmaydi.{' '}
            {deleting.status === 'active' ? <>O‘rniga uni <b>nofaol</b> qiling: yangi yozuvlar ro‘yxatida ko‘rinmaydi, lekin barcha yozuvlar va hisobotlar saqlanib qoladi.</> : <>Bu mol allaqachon nofaol — uning yozuvlari hisobotlarda saqlanib turibdi.</>}</>}
          onCancel={() => setDeleting(null)}
          onConfirm={() => (deleting.status === 'active' ? toggle.mutate(deleting, { onSuccess: () => setDeleting(null) }) : setDeleting(null))}
        />
      ) : (
        <ConfirmDialog
          open={!!deleting}
          title="Molni o‘chirish"
          loading={remove.isPending}
          message={<><b>{deleting?.name}</b> ({deleting?.tagNumber}) molini o‘chirmoqchimisiz? Bu amalni qaytarib bo‘lmaydi.{delError && <div className="mt-2 text-red-600">{delError}</div>}</>}
          onCancel={() => setDeleting(null)}
          onConfirm={() => deleting && remove.mutate(deleting.id, { onError: (e) => setDelError(e instanceof Error ? e.message : 'Xatolik') })}
        />
      )}
    </>
  );
}
