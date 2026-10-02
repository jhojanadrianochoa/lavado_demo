import { useSearchParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { api } from '../lib/api';
import type { Incident, Paged } from '../lib/types';
import { useAuth } from '../auth/AuthContext';
import { useCatalogs, useDebounced, useFilters } from '../components/hooks';
import { DateInput, FilterBar, PointFilter, SearchInput, SelectFilter, UserFilter } from '../components/Filters';
import { IncidentTable } from '../components/lists';
import { Card, ErrorBox, Loading, PageHeader, Pagination } from '../components/ui';
import { PRIORITIES } from './TaskForm';

export default function Incidents() {
  const { hasRole } = useAuth();
  const manager = hasRole('ADMIN', 'SUPERVISOR');
  const [params] = useSearchParams();
  const { data: catalogs } = useCatalogs();
  const { filters, set, reset, page, setPage } = useFilters({ q: '', status: params.get('status') ?? '', type: '', priority: '', pointId: '', userId: '', from: '', to: '' });
  const q = useDebounced(filters.q);
  const { data, isLoading, error } = useQuery({ queryKey: ['incidents', { ...filters, q, page }], queryFn: () => api.get<Paged<Incident>>('/incidents', { ...filters, q, page }) });
  return (
    <>
      <PageHeader
        title={manager ? 'Incidencias' : 'Mis incidencias'}
        subtitle="Problemas encontrados en los puntos o durante las tareas"
        actions={<Link to="/incidencias/nueva" className="btn-primary"><Plus className="h-4 w-4" /> Reportar incidencia</Link>}
      />
      <FilterBar onReset={reset}>
        <SearchInput value={filters.q} onChange={(v) => set({ q: v })} placeholder="Buscar incidencia" />
        <SelectFilter value={filters.status} onChange={(status) => set({ status })} all="Todos los estados" options={['ABIERTA', 'EN_PROCESO', 'SOLUCIONADA', 'CERRADA']} />
        <SelectFilter value={filters.type} onChange={(type) => set({ type })} all="Todos los tipos" options={catalogs?.incidentTypes ?? []} />
        <SelectFilter value={filters.priority} onChange={(priority) => set({ priority })} all="Todas las prioridades" options={PRIORITIES} />
        {manager && <PointFilter value={filters.pointId} onChange={(pointId) => set({ pointId })} />}
        {manager && <UserFilter value={filters.userId} onChange={(userId) => set({ userId })} />}
        <DateInput title="Desde" value={filters.from} onChange={(from) => set({ from })} />
        <DateInput title="Hasta" value={filters.to} onChange={(to) => set({ to })} />
      </FilterBar>
      <ErrorBox error={error} />
      <Card bodyClass="">
        {isLoading ? (
          <Loading />
        ) : (
          <>
            <IncidentTable items={data?.items ?? []} />
            {data && <Pagination page={page} pageSize={data.pageSize} total={data.total} onChange={setPage} />}
          </>
        )}
      </Card>
    </>
  );
}
