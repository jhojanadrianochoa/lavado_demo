import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { MapPin, Pencil, Plus } from 'lucide-react';
import { api } from '../lib/api';
import type { Paged, Point } from '../lib/types';
import { useAuth } from '../auth/AuthContext';
import { useDebounced, useFilters } from '../components/hooks';
import { FilterBar, SearchInput, SelectFilter } from '../components/Filters';
import { ActiveBadge, Button, Card, ErrorBox, Loading, PageHeader, Pagination, Table } from '../components/ui';
import { PointForm } from './PointForm';

export default function Points() {
  const { hasRole } = useAuth();
  const admin = hasRole('ADMIN');
  const qc = useQueryClient();
  const { filters, set, reset, page, setPage } = useFilters({ q: '', active: '' });
  const q = useDebounced(filters.q);
  const [editing, setEditing] = useState<Point | 'new' | null>(null);
  const { data, isLoading, error } = useQuery({ queryKey: ['points', { ...filters, q, page }], queryFn: () => api.get<Paged<Point>>('/points', { ...filters, q, page }) });
  const toggle = useMutation({
    mutationFn: (p: Point) => api.patch(`/points/${p.id}/status`, { active: !p.active }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['points'] }),
  });

  return (
    <>
      <PageHeader
        title="Puntos de lavado"
        subtitle="Puntos de la empresa, encargados y usuarios asociados"
        actions={
          admin && (
            <Button onClick={() => setEditing('new')}>
              <Plus className="h-4 w-4" /> Nuevo punto
            </Button>
          )
        }
      />
      <FilterBar onReset={reset}>
        <SearchInput value={filters.q} onChange={(v) => set({ q: v })} placeholder="Buscar por nombre, código o ciudad" />
        <SelectFilter value={filters.active} onChange={(active) => set({ active })} all="Todos los estados" options={[{ value: 'true', label: 'Activos' }, { value: 'false', label: 'Inactivos' }]} />
      </FilterBar>
      <ErrorBox error={error || toggle.error} />
      <Card bodyClass="">
        {isLoading ? (
          <Loading />
        ) : (
          <>
            <Table
              empty={!data?.items.length}
              head={
                <tr>
                  <th className="th">Código</th>
                  <th className="th">Nombre</th>
                  <th className="th hidden md:table-cell">Dirección</th>
                  <th className="th hidden sm:table-cell">Encargado</th>
                  <th className="th hidden lg:table-cell">Usuarios</th>
                  <th className="th hidden lg:table-cell">Tareas abiertas</th>
                  <th className="th">Estado</th>
                  {admin && <th className="th" />}
                </tr>
              }
            >
              {data?.items.map((p) => (
                <tr key={p.id} className="hover:bg-slate-50">
                  <td className="td font-mono text-xs">{p.code}</td>
                  <td className="td">
                    <Link to={`/puntos/${p.id}`} className="flex items-center gap-1.5 font-medium text-brand-700 hover:underline">
                      <MapPin className="h-4 w-4" /> {p.name}
                    </Link>
                    <span className="text-xs text-slate-500 md:hidden">{p.city}</span>
                  </td>
                  <td className="td hidden md:table-cell">
                    {p.address}
                    <br />
                    <span className="text-xs text-slate-500">{p.city}</span>
                  </td>
                  <td className="td hidden sm:table-cell">{p.manager?.name ?? '—'}</td>
                  <td className="td hidden lg:table-cell">{p._count?.users ?? 0}</td>
                  <td className="td hidden lg:table-cell">{p._count?.tasks ?? 0}</td>
                  <td className="td">
                    <ActiveBadge active={p.active} />
                  </td>
                  {admin && (
                    <td className="td whitespace-nowrap text-right">
                      <button className="btn-ghost" onClick={() => setEditing(p)} aria-label="Editar">
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button className="btn-ghost text-xs" onClick={() => toggle.mutate(p)}>
                        {p.active ? 'Desactivar' : 'Activar'}
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </Table>
            {data && <Pagination page={page} pageSize={data.pageSize} total={data.total} onChange={setPage} />}
          </>
        )}
      </Card>
      {editing && <PointForm point={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
    </>
  );
}
