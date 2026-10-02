import { useQuery } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import { fmtQty } from '../lib/format';
import type { Filling, Paged } from '../lib/types';
import { useDebounced, useFilters } from '../components/hooks';
import { DateInput, FilterBar, PointFilter, ProductFilter, SearchInput, UserFilter } from '../components/Filters';
import { FillingTable } from '../components/lists';
import { Card, ErrorBox, Loading, PageHeader, Pagination } from '../components/ui';

export default function Fillings() {
  const { filters, set, reset, page, setPage } = useFilters({ q: '', pointId: '', productId: '', userId: '', from: '', to: '' });
  const q = useDebounced(filters.q);
  const { data, isLoading, error } = useQuery({
    queryKey: ['fillings', { ...filters, q, page }],
    queryFn: () => api.get<Paged<Filling> & { totals: { unit: string; quantity: number }[] }>('/fillings', { ...filters, q, page }),
  });
  return (
    <>
      <PageHeader
        title="Registros de llenado"
        subtitle="Cantidades realmente llenadas en cada punto"
        actions={<Link to="/llenados/nuevo" className="btn-primary"><Plus className="h-4 w-4" /> Registrar llenado</Link>}
      />
      <FilterBar onReset={reset}>
        <SearchInput value={filters.q} onChange={(v) => set({ q: v })} placeholder="Buscar por punto, producto u observación" />
        <PointFilter value={filters.pointId} onChange={(pointId) => set({ pointId })} />
        <ProductFilter value={filters.productId} onChange={(productId) => set({ productId })} />
        <UserFilter value={filters.userId} onChange={(userId) => set({ userId })} />
        <DateInput title="Desde" value={filters.from} onChange={(from) => set({ from })} />
        <DateInput title="Hasta" value={filters.to} onChange={(to) => set({ to })} />
      </FilterBar>
      <ErrorBox error={error} />
      {data && data.totals.length > 0 && (
        <p className="mb-3 text-sm text-slate-600">
          Total llenado con los filtros: <span className="font-semibold text-brand-800">{data.totals.map((t) => fmtQty(t.quantity, t.unit)).join(' · ')}</span>
        </p>
      )}
      <Card bodyClass="">
        {isLoading ? (
          <Loading />
        ) : (
          <>
            <FillingTable items={data?.items ?? []} />
            {data && <Pagination page={page} pageSize={data.pageSize} total={data.total} onChange={setPage} />}
          </>
        )}
      </Card>
    </>
  );
}
