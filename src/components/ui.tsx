import { useEffect, useRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import clsx from 'clsx';
import { AlertTriangle, ArrowDown, ArrowUp, ChevronLeft, ChevronRight, Loader2, X } from 'lucide-react';

// ---------------------------------------------------------------- Button
type BtnProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
  icon?: ReactNode;
};
export function Button({ variant = 'primary', size = 'md', loading, icon, children, className, disabled, type = 'button', ...rest }: BtnProps) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      className={clsx(
        'inline-flex items-center justify-center gap-2 rounded-lg font-semibold transition active:scale-[.98] disabled:cursor-not-allowed disabled:opacity-60',
        size === 'sm' && 'px-3 py-1.5 text-sm',
        size === 'md' && 'px-4 py-2.5 text-sm',
        size === 'lg' && 'px-5 py-3 text-base',
        variant === 'primary' && 'bg-brand-600 text-white shadow-sm hover:bg-brand-700',
        variant === 'secondary' && 'border border-stone-300 bg-white text-stone-700 hover:bg-stone-50',
        variant === 'danger' && 'bg-red-600 text-white shadow-sm hover:bg-red-700',
        variant === 'ghost' && 'text-stone-600 hover:bg-stone-100',
        className,
      )}
      {...rest}
    >
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : icon}
      {children}
    </button>
  );
}

export function IconButton({ label, children, className, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button type="button" aria-label={label} title={label}
      className={clsx('inline-flex h-9 w-9 items-center justify-center rounded-lg text-stone-500 transition hover:bg-stone-100 hover:text-stone-800 disabled:opacity-40', className)} {...rest}>
      {children}
    </button>
  );
}

// ------------------------------------------------------------------ Card
export function Card({ children, className, title, action, padded = true }: { children: ReactNode; className?: string; title?: ReactNode; action?: ReactNode; padded?: boolean }) {
  return (
    <section className={clsx('rounded-2xl border border-stone-200/80 bg-white shadow-card', className)}>
      {(title || action) && (
        <header className="flex flex-wrap items-center justify-between gap-2 border-b border-stone-100 px-4 py-3 sm:px-5">
          <h2 className="text-[15px] font-semibold text-stone-900">{title}</h2>
          {action}
        </header>
      )}
      <div className={padded ? 'p-4 sm:p-5' : ''}>{children}</div>
    </section>
  );
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-2xl font-bold tracking-tight text-stone-900">{title}</h1>
        {subtitle && <p className="mt-0.5 text-sm text-stone-500">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

// ----------------------------------------------------------------- Modal
export function Modal({ open, onClose, title, children, footer, size = 'md' }: { open: boolean; onClose: () => void; title: string; children: ReactNode; footer?: ReactNode; size?: 'sm' | 'md' | 'lg' | 'xl' }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = prev; };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-label={title}>
      <div className="absolute inset-0 bg-stone-900/50 backdrop-blur-[1px]" onClick={onClose} />
      <div ref={ref} className={clsx(
        'relative flex max-h-[92dvh] w-full flex-col rounded-t-2xl bg-white shadow-2xl sm:rounded-2xl',
        size === 'sm' && 'sm:max-w-md', size === 'md' && 'sm:max-w-lg', size === 'lg' && 'sm:max-w-2xl', size === 'xl' && 'sm:max-w-3xl')}>
        <header className="flex items-center justify-between border-b border-stone-100 px-5 py-4">
          <h2 className="text-lg font-semibold text-stone-900">{title}</h2>
          <IconButton label="Yopish" onClick={onClose}><X className="h-5 w-5" /></IconButton>
        </header>
        <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer && <footer className="pb-safe flex flex-col-reverse gap-2 border-t border-stone-100 px-5 py-3 sm:flex-row sm:justify-end">{footer}</footer>}
      </div>
    </div>
  );
}

export function ConfirmDialog({ open, title, message, confirmLabel = 'Ha, o‘chirish', cancelLabel = 'Bekor qilish', danger = true, loading, onConfirm, onCancel, extra }: {
  open: boolean; title: string; message: ReactNode; confirmLabel?: string; cancelLabel?: string; danger?: boolean; loading?: boolean; onConfirm: () => void; onCancel: () => void; extra?: ReactNode;
}) {
  return (
    <Modal open={open} onClose={onCancel} title={title} size="sm"
      footer={<>
        <Button variant="secondary" onClick={onCancel}>{cancelLabel}</Button>
        {extra}
        <Button variant={danger ? 'danger' : 'primary'} loading={loading} onClick={onConfirm}>{confirmLabel}</Button>
      </>}>
      <div className="flex gap-3">
        <div className={clsx('flex h-10 w-10 shrink-0 items-center justify-center rounded-full', danger ? 'bg-red-100 text-red-600' : 'bg-amber-100 text-amber-600')}>
          <AlertTriangle className="h-5 w-5" />
        </div>
        <div className="text-sm leading-relaxed text-stone-600">{message}</div>
      </div>
    </Modal>
  );
}

// ----------------------------------------------------------------- Forms
export function Field({ label, error, hint, required, children, className }: { label: string; error?: string; hint?: ReactNode; required?: boolean; children: ReactNode; className?: string }) {
  return (
    <label className={clsx('block', className)}>
      <span className="mb-1 block text-sm font-medium text-stone-700">{label}{required && <span className="text-red-500"> *</span>}</span>
      {children}
      {error ? <span className="mt-1 block text-xs font-medium text-red-600" role="alert">{error}</span> : hint ? <span className="mt-1 block text-xs text-stone-500">{hint}</span> : null}
    </label>
  );
}

export function FormError({ message }: { message?: string }) {
  if (!message) return null;
  return <div role="alert" className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{message}</div>;
}

// ------------------------------------------------------------ small blocks
const tones = {
  green: 'bg-brand-50 text-brand-700 ring-brand-200',
  gray: 'bg-stone-100 text-stone-600 ring-stone-200',
  amber: 'bg-amber-50 text-amber-800 ring-amber-200',
  red: 'bg-red-50 text-red-700 ring-red-200',
  blue: 'bg-sky-50 text-sky-700 ring-sky-200',
};
export function Badge({ tone = 'gray', children }: { tone?: keyof typeof tones; children: ReactNode }) {
  return <span className={clsx('inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset', tones[tone])}>{children}</span>;
}

export function EmptyState({ icon, title, text, action }: { icon?: ReactNode; title: string; text?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center px-4 py-12 text-center">
      {icon && <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-brand-50 text-brand-600">{icon}</div>}
      <h3 className="text-base font-semibold text-stone-900">{title}</h3>
      {text && <p className="mt-1 max-w-sm text-sm text-stone-500">{text}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Loading({ label = 'Yuklanmoqda…' }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-12 text-sm text-stone-500" role="status">
      <Loader2 className="h-5 w-5 animate-spin text-brand-600" /> {label}
    </div>
  );
}

export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  return (
    <div className="flex flex-col items-center px-4 py-10 text-center" role="alert">
      <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-red-50 text-red-600"><AlertTriangle className="h-6 w-6" /></div>
      <p className="max-w-md text-sm text-stone-700">{error instanceof Error ? error.message : 'Ma’lumotlarni yuklab bo‘lmadi'}</p>
      {onRetry && <Button className="mt-3" variant="secondary" size="sm" onClick={onRetry}>Qayta urinish</Button>}
    </div>
  );
}

export function StatCard({ label, value, hint, icon, badge, tone = 'green' }: { label: string; value: ReactNode; hint?: ReactNode; icon?: ReactNode; badge?: ReactNode; tone?: 'green' | 'amber' | 'blue' | 'stone' }) {
  const bg = { green: 'bg-brand-50 text-brand-700', amber: 'bg-amber-50 text-amber-700', blue: 'bg-sky-50 text-sky-700', stone: 'bg-stone-100 text-stone-600' }[tone];
  return (
    <div className="rounded-2xl border border-stone-200/80 bg-white p-4 shadow-card">
      <div className="flex items-start justify-between gap-2">
        <p className="text-[13px] font-medium leading-snug text-stone-500">{label}</p>
        {icon && <span className={clsx('flex h-9 w-9 shrink-0 items-center justify-center rounded-xl', bg)}>{icon}</span>}
      </div>
      <p className="mt-2 break-words text-[22px] font-bold leading-tight tracking-tight text-stone-900 sm:text-2xl">{value}</p>
      <div className="mt-1 flex min-h-[1.25rem] flex-wrap items-center gap-1.5 text-xs text-stone-500">{badge}{hint}</div>
    </div>
  );
}

export function Tabs<T extends string>({ tabs, value, onChange }: { tabs: { id: T; label: string }[]; value: T; onChange: (v: T) => void }) {
  return (
    <div className="mb-4 inline-flex max-w-full overflow-x-auto rounded-xl bg-stone-200/60 p-1" role="tablist">
      {tabs.map((t) => (
        <button key={t.id} role="tab" aria-selected={value === t.id} onClick={() => onChange(t.id)}
          className={clsx('whitespace-nowrap rounded-lg px-4 py-2 text-sm font-semibold transition', value === t.id ? 'bg-white text-brand-700 shadow-sm' : 'text-stone-600 hover:text-stone-900')}>
          {t.label}
        </button>
      ))}
    </div>
  );
}

// --------------------------------------------------------- tables / paging
export function SortTh({ label, field, sort, dir, onSort, className }: { label: string; field: string; sort: string; dir: 'asc' | 'desc'; onSort: (f: string) => void; className?: string }) {
  const active = sort === field;
  return (
    <th className={clsx('th', className)} aria-sort={active ? (dir === 'asc' ? 'ascending' : 'descending') : 'none'}>
      <button type="button" onClick={() => onSort(field)} className={clsx('inline-flex items-center gap-1 uppercase', active && 'text-brand-700')}>
        {label}
        {active ? (dir === 'asc' ? <ArrowUp className="h-3.5 w-3.5" /> : <ArrowDown className="h-3.5 w-3.5" />) : <span className="h-3.5 w-3.5 opacity-0">·</span>}
      </button>
    </th>
  );
}

export function Pagination({ page, totalPages, total, pageSize, onPage }: { page: number; totalPages: number; total: number; pageSize: number; onPage: (p: number) => void }) {
  if (total <= 0) return null;
  const from = (page - 1) * pageSize + 1, to = Math.min(page * pageSize, total);
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-t border-stone-100 px-4 py-3 text-sm text-stone-500">
      <span>{from}–{to} / {total}</span>
      {totalPages > 1 && (
        <div className="flex items-center gap-1">
          <IconButton label="Oldingi sahifa" disabled={page <= 1} onClick={() => onPage(page - 1)}><ChevronLeft className="h-5 w-5" /></IconButton>
          <span className="px-2 font-medium text-stone-700">{page} / {totalPages}</span>
          <IconButton label="Keyingi sahifa" disabled={page >= totalPages} onClick={() => onPage(page + 1)}><ChevronRight className="h-5 w-5" /></IconButton>
        </div>
      )}
    </div>
  );
}
