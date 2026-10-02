import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { KeyRound, Pencil, Plus } from 'lucide-react';
import { api } from '../lib/api';
import { fmtDateTime, label } from '../lib/format';
import type { Paged, Role, User } from '../lib/types';
import { useDebounced, useFilters, usePointOptions } from '../components/hooks';
import { FilterBar, PointFilter, SearchInput, SelectFilter } from '../components/Filters';
import { ActiveBadge, Button, Card, ErrorBox, Field, Loading, Modal, PageHeader, Pagination, Table } from '../components/ui';

const ROLES: Role[] = ['ADMIN', 'SUPERVISOR', 'WORKER'];

function UserForm({ user, onClose }: { user: User | null; onClose: () => void }) {
  const qc = useQueryClient();
  const { data: points = [] } = usePointOptions();
  const [form, setForm] = useState({
    name: user?.name ?? '',
    username: user?.username ?? '',
    email: user?.email ?? '',
    phone: user?.phone ?? '',
    role: user?.role ?? ('WORKER' as Role),
    active: user?.active ?? true,
    password: '',
  });
  const [pointIds, setPointIds] = useState<number[]>(user?.points.map((p) => p.point.id) ?? []);
  const save = useMutation({
    mutationFn: () => {
      const { password, ...rest } = form;
      const body = { ...rest, pointIds };
      return user ? api.put(`/users/${user.id}`, body) : api.post('/users', { ...body, password });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['users'] });
      onClose();
    },
  });
  const submit = (e: FormEvent) => {
    e.preventDefault();
    save.mutate();
  };
  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title={user ? `Editar usuario ${user.name}` : 'Nuevo usuario'}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button type="submit" form="user-form" loading={save.isPending}>Guardar</Button>
        </>
      }
    >
      <form id="user-form" onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
        <Field label="Nombre completo *">
          <input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
        </Field>
        <Field label="Usuario *" hint="Letras minúsculas, números, punto o guion">
          <input className="input" autoCapitalize="none" value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value.toLowerCase() })} required minLength={3} />
        </Field>
        <Field label="Correo electrónico">
          <input className="input" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
        </Field>
        <Field label="Teléfono">
          <input className="input" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
        </Field>
        <Field label="Rol *">
          <select className="input" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as Role })}>
            {ROLES.map((r) => (
              <option key={r} value={r}>{label(r)}</option>
            ))}
          </select>
        </Field>
        <Field label="Estado">
          <select className="input" value={form.active ? '1' : '0'} onChange={(e) => setForm({ ...form, active: e.target.value === '1' })}>
            <option value="1">Activo</option>
            <option value="0">Inactivo</option>
          </select>
        </Field>
        {!user && (
          <Field label="Contraseña *" hint="Mínimo 8 caracteres" className="sm:col-span-2">
            <input className="input" type="password" autoComplete="new-password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required minLength={8} />
          </Field>
        )}
        {form.role !== 'ADMIN' && (
          <div className="sm:col-span-2">
            <span className="label">Puntos asignados</span>
            <div className="flex flex-wrap gap-2">
              {points.map((p) => {
                const on = pointIds.includes(p.id);
                return (
                  <label key={p.id} className={`cursor-pointer rounded-full border px-3 py-1 text-sm ${on ? 'border-brand-700 bg-brand-50 text-brand-800' : 'border-slate-300 text-slate-600'}`}>
                    <input type="checkbox" className="sr-only" checked={on} onChange={() => setPointIds(on ? pointIds.filter((x) => x !== p.id) : [...pointIds, p.id])} />
                    {p.name}
                  </label>
                );
              })}
            </div>
          </div>
        )}
        <div className="sm:col-span-2">
          <ErrorBox error={save.error} />
        </div>
      </form>
    </Modal>
  );
}

function PasswordForm({ user, onClose }: { user: User; onClose: () => void }) {
  const [password, setPassword] = useState('');
  const save = useMutation({ mutationFn: () => api.post(`/users/${user.id}/password`, { password }), onSuccess: onClose });
  return (
    <Modal
      open
      onClose={onClose}
      title={`Cambiar contraseña de ${user.name}`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button onClick={() => save.mutate()} loading={save.isPending} disabled={password.length < 8}>Guardar</Button>
        </>
      }
    >
      <Field label="Nueva contraseña" hint="Mínimo 8 caracteres">
        <input className="input" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
      </Field>
      <div className="mt-3">
        <ErrorBox error={save.error} />
      </div>
    </Modal>
  );
}

export default function Users() {
  const qc = useQueryClient();
  const { filters, set, reset, page, setPage } = useFilters({ q: '', role: '', active: '', pointId: '' });
  const q = useDebounced(filters.q);
  const [editing, setEditing] = useState<User | 'new' | null>(null);
  const [pwd, setPwd] = useState<User | null>(null);
  const { data, isLoading, error } = useQuery({ queryKey: ['users', { ...filters, q, page }], queryFn: () => api.get<Paged<User>>('/users', { ...filters, q, page }) });
  const toggle = useMutation({ mutationFn: (u: User) => api.patch(`/users/${u.id}/status`, { active: !u.active }), onSuccess: () => qc.invalidateQueries({ queryKey: ['users'] }) });

  return (
    <>
      <PageHeader title="Usuarios" subtitle="Cuentas, roles y puntos asignados" actions={<Button onClick={() => setEditing('new')}><Plus className="h-4 w-4" /> Nuevo usuario</Button>} />
      <FilterBar onReset={reset}>
        <SearchInput value={filters.q} onChange={(v) => set({ q: v })} placeholder="Buscar por nombre o usuario" />
        <SelectFilter value={filters.role} onChange={(role) => set({ role })} all="Todos los roles" options={ROLES} />
        <SelectFilter value={filters.active} onChange={(active) => set({ active })} all="Todos los estados" options={[{ value: 'true', label: 'Activos' }, { value: 'false', label: 'Inactivos' }]} />
        <PointFilter value={filters.pointId} onChange={(pointId) => set({ pointId })} />
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
                  <th className="th">Nombre</th>
                  <th className="th">Rol</th>
                  <th className="th hidden md:table-cell">Puntos</th>
                  <th className="th hidden lg:table-cell">Último acceso</th>
                  <th className="th">Estado</th>
                  <th className="th" />
                </tr>
              }
            >
              {data?.items.map((u) => (
                <tr key={u.id} className="hover:bg-slate-50">
                  <td className="td">
                    <p className="font-medium">{u.name}</p>
                    <p className="text-xs text-slate-500">@{u.username}{u.email ? ` · ${u.email}` : ''}</p>
                  </td>
                  <td className="td">{label(u.role)}</td>
                  <td className="td hidden md:table-cell">{u.points.map((p) => p.point.name).join(', ') || '—'}</td>
                  <td className="td hidden lg:table-cell">{fmtDateTime(u.lastLoginAt)}</td>
                  <td className="td"><ActiveBadge active={u.active} /></td>
                  <td className="td whitespace-nowrap text-right">
                    <button className="btn-ghost" onClick={() => setEditing(u)} aria-label="Editar"><Pencil className="h-4 w-4" /></button>
                    <button className="btn-ghost" onClick={() => setPwd(u)} aria-label="Cambiar contraseña"><KeyRound className="h-4 w-4" /></button>
                    <button className="btn-ghost text-xs" onClick={() => toggle.mutate(u)}>{u.active ? 'Desactivar' : 'Activar'}</button>
                  </td>
                </tr>
              ))}
            </Table>
            {data && <Pagination page={page} pageSize={data.pageSize} total={data.total} onChange={setPage} />}
          </>
        )}
      </Card>
      {editing && <UserForm user={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
      {pwd && <PasswordForm user={pwd} onClose={() => setPwd(null)} />}
    </>
  );
}
