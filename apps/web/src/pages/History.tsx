import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import type { HistoryEntry } from '../lib/types';
import { useAuth } from '../auth/AuthContext';
import { useCatalogs, useFilters } from '../components/hooks';
import { DateInput, FilterBar, PointFilter, ProductFilter, SelectFilter, UserFilter } from '../components/Filters';
import { HistoryList } from '../components/lists';
import { Button, Card, ErrorBox, Loading, PageHeader } from '../components/ui';

const KINDS = [
  { value: 'TAREA', label: 'Tareas' },
  { value: 'REQUERIMIENTO', label: 'Requerimientos' },
  { value: 'LLENADO', label: 'Llenados' },
  { value: 'INCIDENCIA', label: 'Incidencias' },
  { value: 'INVENTARIO', label: 'Movimientos de inventario' },
  { value: 'FOTO', label: 'Fotografías' },
];

export default function History() {
  const { hasRole } = useAuth();
  const manager = hasRole('ADMIN', 'SUPERVISOR');
  const { data: catalogs } = useCatalogs();
  const { filters, set, reset, page, setPage } = useFilters({ kind: '', pointId: '', productId: '', userId: '', taskType: '', status: '', incidentType: '', from: '', to: '' });
  const { data, isLoading, error } = useQuery({
    queryKey: ['history', filters, page],
    queryFn: () => api.get<{ items: HistoryEntry[]; hasMore: boolean; page: number }>('/history', { ...filters, page, pageSize: 30 }),
  });
  const statuses = ['PENDIENTE', 'ASIGNADA', 'EN_PROCESO', 'COMPLETADA', 'CANCELADA', 'ABIERTA', 'SOLUCIONADA', 'CERRADA'];
  return (
    <>
      <PageHeader title={manager ? 'Historial' : 'Mi historial'} subtitle="Registro cronológico de tareas, llenados, incidencias, fotografías y movimientos" />
      <FilterBar onReset={reset}>
        <SelectFilter value={filters.kind} onChange={(kind) => set({ kind })} all="Todos los registros" options={KINDS} />
        {manager && <PointFilter value={filters.pointId} onChange={(pointId) => set({ pointId })} />}
        <ProductFilter value={filters.productId} onChange={(productId) => set({ productId })} />
        {manager && <UserFilter value={filters.userId} onChange={(userId) => set({ userId })} />}
        <SelectFilter value={filters.taskType} onChange={(taskType) => set({ taskType })} all="Todo tipo de tarea" options={catalogs?.taskTypes ?? []} />
        <SelectFilter value={filters.status} onChange={(status) => set({ status })} all="Todos los estados" options={statuses} />
        <SelectFilter value={filters.incidentType} onChange={(incidentType) => set({ incidentType })} all="Toda incidencia" options={catalogs?.incidentTypes ?? []} />
        <DateInput title="Desde" value={filters.from} onChange={(from) => set({ from })} />
        <DateInput title="Hasta" value={filters.to} onChange={(to) => set({ to })} />
      </FilterBar>
      <ErrorBox error={error} />
      <Card bodyClass="">
        {isLoading ? <Loading /> : <HistoryList items={data?.items ?? []} />}
        {(page > 1 || data?.hasMore) && (
          <div className="flex items-center justify-between border-t border-slate-100 px-4 py-3">
            <Button variant="secondary" disabled={page <= 1} onClick={() => setPage(page - 1)}>Anterior</Button>
            <span className="text-sm text-slate-500">Página {page}</span>
            <Button variant="secondary" disabled={!data?.hasMore} onClick={() => setPage(page + 1)}>Siguiente</Button>
          </div>
        )}
      </Card>
    </>
  );
}
