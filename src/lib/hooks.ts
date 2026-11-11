import { useCallback, useEffect, useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { api } from './api';
import type { Animal, Paged } from '../../shared/types';

export function useDebounced<T>(value: T, ms = 300): T {
  const [v, setV] = useState(value);
  useEffect(() => { const t = setTimeout(() => setV(value), ms); return () => clearTimeout(t); }, [value, ms]);
  return v;
}

export function useSort(initial: string, initialDir: 'asc' | 'desc' = 'desc') {
  const [sort, setSort] = useState(initial);
  const [dir, setDir] = useState<'asc' | 'desc'>(initialDir);
  const onSort = useCallback((f: string) => {
    setSort((cur) => {
      if (cur === f) { setDir((d) => (d === 'asc' ? 'desc' : 'asc')); return cur; }
      setDir(f === 'date' || f === 'total' || f === 'quantity' || f === 'cost' || f === 'revenue' || f === 'amount' ? 'desc' : 'asc');
      return f;
    });
  }, []);
  return { sort, dir, onSort, setSort, setDir };
}

/** Filtrlar o'zgarganda sahifa avtomatik 1-ga qaytadi. */
export function useFilters<T extends Record<string, string>>(initial: T) {
  const [filters, setFilters] = useState<T>(initial);
  const [page, setPage] = useState(1);
  const patch = useCallback((p: Partial<T>) => { setFilters((f) => ({ ...f, ...p })); setPage(1); }, []);
  return { filters, patch, page, setPage };
}

export function useList<T>(key: string, url: string, params: Record<string, any>) {
  return useQuery({
    queryKey: [key, params],
    queryFn: () => api.get<T>(url, params),
    placeholderData: keepPreviousData,
  });
}

export type AnimalPage = Paged<Animal> & { activeCount: number; inactiveCount: number };

export function useAnimalOptions() {
  return useQuery({
    queryKey: ['animals', 'options'],
    queryFn: () => api.get<AnimalPage>('/animals', { pageSize: 'all', sort: 'tag', dir: 'asc' }),
    select: (d) => d.rows,
  });
}
