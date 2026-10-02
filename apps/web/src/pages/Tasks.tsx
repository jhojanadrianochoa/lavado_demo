import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { api } from '../lib/api';
import type { Paged, Task } from '../lib/types';
import { useAuth } from '../auth/AuthContext';
import { useCatalogs, useDebounced, useFilters } from '../components/hooks';
import { DateInput, FilterBar, PointFilter, ProductFilter, SearchInput, SelectFilter, UserFilter } from '../components/Filters';
import { TaskTable } from '../components/lists';
import { Button, Card, ErrorBox, Loading, PageHeader, Pagination } from '../components/ui';
import { PRIORITIES, TaskForm } from './TaskForm';

const STATUSES = ['PENDIENTE', 'ASIGNADA', 'EN_PROCESO', 'COMPLETADA', 'CANCELADA'];

export default function Tasks() {
  const { hasRole } = useAuth();
  const manager = hasRole('ADMIN', 'SUPERVISOR');
  const [params] = useSearchParams();
  const { data: catalogs } = useCatalogs();
  const { filters, set, reset, page, setPage } = useFilters({
    q: '',
    status: params.get('status') ?? '',
    type: '',
    priority: '',
    pointId: params.get('pointId') ?? '',
    productId: '',
    userId: '',
    from: '',
    to: '',
  });
  const q = useDebounced(filters.q);
  const [creating, setCreating] = useState(false);
  const { data, isLoading, error } = useQuery({ queryKey: ['tasks', { ...filters, q, page }], queryFn: () => api.get<Paged<Task>>('/tasks', { ...filters, q, page }) });

  return (
    <>
      <PageHeader
        title={manager ? 'Tareas' : 'Mis tareas'}
        subtitle={manager ? 'Creación, asignación y seguimiento de tareas' : 'Tareas asignadas a usted'}
        actions={manager && <Button onClick={() => setCreating(true)}><Plus className="h-4 w-4" /> Nueva tarea</Button>}
      />
      <FilterBar onReset={reset}>
        <SearchInput value={filters.q} onChange={(v) => set({ q: v })} placeholder="Buscar por descripción, punto o #" />
        <SelectFilter value={filters.status} onChange={(status) => set({ status })} all="Todos los estados" options={STATUSES} />
        <SelectFilter value={filters.type} onChange={(type) => set({ type })} all="Todos los tipos" options={catalogs?.taskTypes ?? []} />
        <SelectFilter value={filters.priority} onChange={(priority) => set({ priority })} all="Todas las prioridades" options={PRIORITIES} />
        {manager && <PointFilter value={filters.pointId} onChange={(pointId) => set({ pointId })} />}
        <ProductFilter value={filters.productId} onChange={(productId) => set({ productId })} />
        {manager && <UserFilter value={filters.userId} onChange={(userId) => set({ userId })} />}
        <DateInput title="Creada desde" value={filters.from} onChange={(from) => set({ from })} />
        <DateInput title="Creada hasta" value={filters.to} onChange={(to) => set({ to })} />
      </FilterBar>
      <ErrorBox error={error} />
      <Card bodyClass="">
        {isLoading ? (
          <Loading />
        ) : (
          <>
            <TaskTable items={data?.items ?? []} />
            {data && <Pagination page={page} pageSize={data.pageSize} total={data.total} onChange={setPage} />}
          </>
        )}
      </Card>
      {creating && <TaskForm task={null} onClose={() => setCreating(false)} />}
    </>
  );
}
