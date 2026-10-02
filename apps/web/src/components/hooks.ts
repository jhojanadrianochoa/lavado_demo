import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import type { Catalogs, Paged, Point, Product, User } from '../lib/types';
import { useAuth } from '../auth/AuthContext';

export function useCatalogs() {
  return useQuery({ queryKey: ['catalogs'], queryFn: () => api.get<Catalogs>('/settings/catalogs'), staleTime: Infinity });
}

export function usePointOptions(activeOnly = false) {
  return useQuery({
    queryKey: ['points', 'options', activeOnly],
    queryFn: () => api.get<Paged<Point>>('/points', { pageSize: 500, active: activeOnly ? 'true' : undefined }),
    select: (d) => d.items,
  });
}

export function useProductOptions(activeOnly = true) {
  return useQuery({
    queryKey: ['products', 'options', activeOnly],
    queryFn: () => api.get<Paged<Product>>('/products', { pageSize: 500, active: activeOnly ? 'true' : undefined }),
    select: (d) => d.items,
  });
}

export function useUserOptions(params: { role?: string; pointId?: number | string } = {}) {
  const { hasRole } = useAuth();
  return useQuery({
    queryKey: ['users', 'options', params],
    queryFn: () => api.get<Paged<User>>('/users', { pageSize: 500, active: 'true', ...params }),
    select: (d) => d.items,
    enabled: hasRole('ADMIN', 'SUPERVISOR'),
  });
}

export function useDebounced<T>(value: T, ms = 350) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

/** Estado de filtros sencillos con reinicio de página. */
export function useFilters<T extends Record<string, string>>(initial: T) {
  const [filters, setFilters] = useState<T>(initial);
  const [page, setPage] = useState(1);
  const set = (patch: Partial<T>) => {
    setFilters((f) => ({ ...f, ...patch }));
    setPage(1);
  };
  const reset = () => {
    setFilters(initial);
    setPage(1);
  };
  return { filters, set, reset, page, setPage };
}
