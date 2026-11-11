import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { UseFormSetError, FieldValues, Path } from 'react-hook-form';
import { api, ApiError } from './api';
import { useToast } from './toast';
import { formatMoney } from '../../shared/format';
import type { Settings } from '../../shared/types';

interface AppCtx {
  settings: Settings;
  money: (n: number | null | undefined) => string;
  today: string;
}
const Ctx = createContext<AppCtx | null>(null);
export const useApp = () => {
  const c = useContext(Ctx);
  if (!c) throw new Error('AppProvider topilmadi');
  return c;
};

export function AppProvider({ settings, children }: { settings: Settings; children: ReactNode }) {
  const value = useMemo<AppCtx>(
    () => ({ settings, today: settings.today, money: (n) => formatMoney(n, settings.currencyLabel) }),
    [settings],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSettingsQuery() {
  return useQuery({ queryKey: ['settings'], queryFn: () => api.get<Settings>('/settings'), staleTime: 60_000 });
}

/** API xatosidagi maydon xabarlarini formaga joylaydi. Bajarilsa true. */
export function applyApiError<T extends FieldValues>(err: unknown, setError: UseFormSetError<T>): boolean {
  if (err instanceof ApiError && err.fields) {
    let any = false;
    for (const [k, msg] of Object.entries(err.fields)) {
      if (k === '_') continue;
      setError(k as Path<T>, { type: 'server', message: msg });
      any = true;
    }
    return any;
  }
  return false;
}

/** Yozish amali: muvaffaqiyatda xabar chiqaradi va barcha so'rovlarni yangilaydi (hisobotlar avtomatik yangilanadi). */
export function useMut<TArg, TRes = unknown>(fn: (a: TArg) => Promise<TRes>, opts: { success?: string | ((r: TRes) => string); silentError?: boolean; onSuccess?: (r: TRes) => void } = {}) {
  const qc = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: fn,
    onSuccess: async (r) => {
      await qc.invalidateQueries();
      const msg = typeof opts.success === 'function' ? opts.success(r) : opts.success;
      if (msg) toast.success(msg);
      opts.onSuccess?.(r);
    },
    onError: (e) => {
      if (opts.silentError) return;
      toast.error(e instanceof Error ? e.message : 'Xatolik yuz berdi');
    },
  });
}
