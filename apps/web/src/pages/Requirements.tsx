import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowRightCircle, Ban, Plus } from 'lucide-react';
import { api } from '../lib/api';
import { fmtDateTime, label, toLocalInput } from '../lib/format';
import type { Paged, Priority, Requirement, Task } from '../lib/types';
import { useAuth } from '../auth/AuthContext';
import { useCatalogs, useDebounced, useFilters, usePointOptions, useProductOptions } from '../components/hooks';
import { DateInput, FilterBar, PointFilter, SearchInput, SelectFilter } from '../components/Filters';
import { Badge, Button, Card, ErrorBox, Field, Loading, Modal, PageHeader, Pagination, Table } from '../components/ui';
import { AssigneeSelect, PRIORITIES } from './TaskForm';

const STATUSES = ['PENDIENTE', 'ASIGNADO', 'EN_PROCESO', 'COMPLETADO', 'CANCELADO'];

function RequirementForm({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const { data: catalogs } = useCatalogs();
  const { data: points = [] } = usePointOptions(true);
  const { data: products = [] } = useProductOptions();
  const [form, setForm] = useState({ pointId: '', type: 'LLENADO_PRODUCTO', productId: '', description: '', priority: 'MEDIA' as Priority, notes: '' });
  const needsProduct = form.type === 'LLENADO_PRODUCTO';
  const save = useMutation({
    mutationFn: () => api.post('/requirements', { ...form, pointId: Number(form.pointId), productId: needsProduct && form.productId ? Number(form.productId) : null }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['requirements'] });
      onClose();
    },
  });
  const submit = (e: FormEvent) => {
    e.preventDefault();
    save.mutate();
  };
  return (
    <Modal open onClose={onClose} title="Nuevo requerimiento" size="lg" footer={<><Button variant="secondary" onClick={onClose}>Cancelar</Button><Button type="submit" form="req-form" loading={save.isPending}>Guardar</Button></>}>
      <form id="req-form" onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
        <Field label="Punto de lavado *">
          <select className="input" value={form.pointId} onChange={(e) => setForm({ ...form, pointId: e.target.value })} required>
            <option value="">Seleccione…</option>
            {points.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </Field>
        <Field label="Tipo *">
          <select className="input" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
            {(catalogs?.requirementTypes ?? []).map((t) => <option key={t} value={t}>{label(t)}</option>)}
          </select>
        </Field>
        {needsProduct && (
          <Field label="Producto">
            <select className="input" value={form.productId} onChange={(e) => setForm({ ...form, productId: e.target.value })}>
              <option value="">Seleccione…</option>
              {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </Field>
        )}
        <Field label="Prioridad">
          <select className="input" value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value as Priority })}>
            {PRIORITIES.map((p) => <option key={p} value={p}>{label(p)}</option>)}
          </select>
        </Field>
        <Field label="Descripción *" className="sm:col-span-2">
          <textarea className="input" rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} required minLength={3} placeholder="Ej.: Necesito llenar espuma" />
        </Field>
        <Field label="Observaciones" className="sm:col-span-2">
          <textarea className="input" rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
        </Field>
        <div className="sm:col-span-2"><ErrorBox error={save.error} /></div>
      </form>
    </Modal>
  );
}

function ConvertForm({ req, onClose }: { req: Requirement; onClose: () => void }) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [form, setForm] = useState({ assigneeId: '', dueDate: toLocalInput(null), description: req.description, priority: req.priority });
  const save = useMutation({
    mutationFn: () =>
      api.post<Task>(`/requirements/${req.id}/convert`, {
        ...form,
        assigneeId: form.assigneeId ? Number(form.assigneeId) : null,
        dueDate: form.dueDate ? new Date(form.dueDate).toISOString() : null,
      }),
    onSuccess: (t) => {
      qc.invalidateQueries({ queryKey: ['requirements'] });
      qc.invalidateQueries({ queryKey: ['tasks'] });
      navigate(`/tareas/${t.id}`);
    },
  });
  return (
    <Modal open onClose={onClose} title={`Convertir requerimiento #${req.id} en tarea`} footer={<><Button variant="secondary" onClick={onClose}>Cancelar</Button><Button onClick={() => save.mutate()} loading={save.isPending}>Crear tarea</Button></>}>
      <div className="space-y-4">
        <p className="rounded-lg bg-slate-50 p-3 text-sm">{req.point.name} · {label(req.type)}{req.product ? ` · ${req.product.name}` : ''}</p>
        <Field label="Descripción de la tarea">
          <textarea className="input" rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
        </Field>
        <Field label="Responsable">
          <AssigneeSelect value={form.assigneeId} onChange={(assigneeId) => setForm({ ...form, assigneeId })} pointId={req.pointId} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Prioridad">
            <select className="input" value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value as Priority })}>
              {PRIORITIES.map((p) => <option key={p} value={p}>{label(p)}</option>)}
            </select>
          </Field>
          <Field label="Fecha límite">
            <input className="input" type="datetime-local" value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} />
          </Field>
        </div>
        <ErrorBox error={save.error} />
      </div>
    </Modal>
  );
}

export default function Requirements() {
  const { hasRole } = useAuth();
  const manager = hasRole('ADMIN', 'SUPERVISOR');
  const qc = useQueryClient();
  const { data: catalogs } = useCatalogs();
  const { filters, set, reset, page, setPage } = useFilters({ q: '', status: '', type: '', priority: '', pointId: '', from: '', to: '' });
  const q = useDebounced(filters.q);
  const [creating, setCreating] = useState(false);
  const [converting, setConverting] = useState<Requirement | null>(null);
  const { data, isLoading, error } = useQuery({ queryKey: ['requirements', { ...filters, q, page }], queryFn: () => api.get<Paged<Requirement>>('/requirements', { ...filters, q, page }) });
  const cancel = useMutation({
    mutationFn: (r: Requirement) => api.patch(`/requirements/${r.id}/status`, { status: 'CANCELADO' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['requirements'] }),
  });

  return (
    <>
      <PageHeader title="Requerimientos" subtitle="Necesidades reportadas por los puntos de lavado" actions={<Button onClick={() => setCreating(true)}><Plus className="h-4 w-4" /> Nuevo requerimiento</Button>} />
      <FilterBar onReset={reset}>
        <SearchInput value={filters.q} onChange={(v) => set({ q: v })} placeholder="Buscar requerimiento" />
        <SelectFilter value={filters.status} onChange={(status) => set({ status })} all="Todos los estados" options={STATUSES} />
        <SelectFilter value={filters.type} onChange={(type) => set({ type })} all="Todos los tipos" options={catalogs?.requirementTypes ?? []} />
        <SelectFilter value={filters.priority} onChange={(priority) => set({ priority })} all="Todas las prioridades" options={PRIORITIES} />
        <PointFilter value={filters.pointId} onChange={(pointId) => set({ pointId })} />
        <DateInput title="Desde" value={filters.from} onChange={(from) => set({ from })} />
        <DateInput title="Hasta" value={filters.to} onChange={(to) => set({ to })} />
      </FilterBar>
      <ErrorBox error={error || cancel.error} />
      <Card bodyClass="">
        {isLoading ? (
          <Loading />
        ) : (
          <>
            <Table
              empty={!data?.items.length}
              head={
                <tr>
                  <th className="th">#</th>
                  <th className="th">Requerimiento</th>
                  <th className="th hidden md:table-cell">Punto</th>
                  <th className="th hidden lg:table-cell">Creado por</th>
                  <th className="th hidden lg:table-cell">Responsable</th>
                  <th className="th hidden sm:table-cell">Prioridad</th>
                  <th className="th">Estado</th>
                  {manager && <th className="th" />}
                </tr>
              }
            >
              {data?.items.map((r) => {
                const open = r.status === 'PENDIENTE' || r.status === 'ASIGNADO' || r.status === 'EN_PROCESO';
                return (
                  <tr key={r.id} className="hover:bg-slate-50">
                    <td className="td font-mono text-xs text-slate-500">{r.id}</td>
                    <td className="td">
                      <p className="font-medium">{r.description}</p>
                      <p className="text-xs text-slate-500">
                        {label(r.type)}{r.product ? ` · ${r.product.name}` : ''} · {fmtDateTime(r.createdAt)}
                        <span className="md:hidden"> · {r.point.name}</span>
                      </p>
                      {r.tasks.map((t) => (
                        <Link key={t.id} to={`/tareas/${t.id}`} className="mr-2 text-xs font-medium text-brand-700 hover:underline">Tarea #{t.id} ({label(t.status)})</Link>
                      ))}
                    </td>
                    <td className="td hidden md:table-cell">{r.point.name}</td>
                    <td className="td hidden lg:table-cell">{r.createdBy.name}</td>
                    <td className="td hidden lg:table-cell">{r.assignee?.name ?? '—'}</td>
                    <td className="td hidden sm:table-cell"><Badge value={r.priority} /></td>
                    <td className="td"><Badge value={r.status} /></td>
                    {manager && (
                      <td className="td whitespace-nowrap text-right">
                        {r.status === 'PENDIENTE' && (
                          <button className="btn-ghost text-xs text-brand-700" onClick={() => setConverting(r)}><ArrowRightCircle className="h-4 w-4" /> Crear tarea</button>
                        )}
                        {open && (
                          <button className="btn-ghost text-xs" onClick={() => window.confirm('¿Cancelar este requerimiento?') && cancel.mutate(r)} aria-label="Cancelar"><Ban className="h-4 w-4" /></button>
                        )}
                      </td>
                    )}
                  </tr>
                );
              })}
            </Table>
            {data && <Pagination page={page} pageSize={data.pageSize} total={data.total} onChange={setPage} />}
          </>
        )}
      </Card>
      {creating && <RequirementForm onClose={() => setCreating(false)} />}
      {converting && <ConvertForm req={converting} onClose={() => setConverting(null)} />}
    </>
  );
}
