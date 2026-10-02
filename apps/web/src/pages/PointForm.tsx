import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import type { Point } from '../lib/types';
import { useProductOptions, useUserOptions } from '../components/hooks';
import { Button, ErrorBox, Field, Modal } from '../components/ui';
import { label } from '../lib/format';

export function PointForm({ point, onClose }: { point: Point | null; onClose: () => void }) {
  const qc = useQueryClient();
  const { data: detail } = useQuery({ queryKey: ['point', point?.id], queryFn: () => api.get<Point>(`/points/${point!.id}`), enabled: Boolean(point) });
  const { data: users = [] } = useUserOptions();
  const { data: products = [] } = useProductOptions();
  const [form, setForm] = useState({
    code: point?.code ?? '',
    name: point?.name ?? '',
    address: point?.address ?? '',
    city: point?.city ?? '',
    managerId: point?.managerId ? String(point.managerId) : '',
    notes: point?.notes ?? '',
    active: point?.active ?? true,
  });
  const [userIds, setUserIds] = useState<number[] | null>(null);
  const [productIds, setProductIds] = useState<number[] | null>(null);
  const currentUsers = userIds ?? detail?.users?.map((u) => u.user.id) ?? [];
  const currentProducts = productIds ?? (point ? (detail?.products?.map((p) => p.product.id) ?? []) : products.map((p) => p.id));

  const save = useMutation({
    mutationFn: () => {
      const body = { ...form, managerId: form.managerId ? Number(form.managerId) : null, userIds: currentUsers, productIds: currentProducts };
      return point ? api.put(`/points/${point.id}`, body) : api.post('/points', body);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['points'] });
      qc.invalidateQueries({ queryKey: ['point'] });
      onClose();
    },
  });
  const submit = (e: FormEvent) => {
    e.preventDefault();
    save.mutate();
  };
  const toggleIn = (list: number[], id: number) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);
  const loadingDetail = Boolean(point) && !detail;

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title={point ? `Editar punto ${point.name}` : 'Nuevo punto de lavado'}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" form="point-form" loading={save.isPending} disabled={loadingDetail}>
            Guardar
          </Button>
        </>
      }
    >
      <form id="point-form" onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
        <Field label="Código del punto *">
          <input className="input uppercase" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} required maxLength={30} />
        </Field>
        <Field label="Nombre *">
          <input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
        </Field>
        <Field label="Dirección *">
          <input className="input" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} required />
        </Field>
        <Field label="Ciudad / localidad *">
          <input className="input" value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} required />
        </Field>
        <Field label="Encargado">
          <select className="input" value={form.managerId} onChange={(e) => setForm({ ...form, managerId: e.target.value })}>
            <option value="">Sin encargado</option>
            {users
              .filter((u) => u.role !== 'WORKER')
              .map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name} ({label(u.role)})
                </option>
              ))}
          </select>
        </Field>
        <Field label="Estado">
          <select className="input" value={form.active ? '1' : '0'} onChange={(e) => setForm({ ...form, active: e.target.value === '1' })}>
            <option value="1">Activo</option>
            <option value="0">Inactivo</option>
          </select>
        </Field>
        <Field label="Observaciones" className="sm:col-span-2">
          <textarea className="input" rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
        </Field>
        <div className="sm:col-span-2">
          <span className="label">Usuarios asociados</span>
          <div className="flex max-h-40 flex-wrap gap-2 overflow-y-auto rounded-lg border border-slate-200 p-2">
            {users.map((u) => (
              <label key={u.id} className={`cursor-pointer rounded-full border px-3 py-1 text-sm ${currentUsers.includes(u.id) ? 'border-brand-700 bg-brand-50 text-brand-800' : 'border-slate-300 text-slate-600'}`}>
                <input type="checkbox" className="sr-only" checked={currentUsers.includes(u.id)} onChange={() => setUserIds(toggleIn(currentUsers, u.id))} />
                {u.name} · {label(u.role)}
              </label>
            ))}
          </div>
        </div>
        <div className="sm:col-span-2">
          <span className="label">Productos utilizados</span>
          <div className="flex flex-wrap gap-2">
            {products.map((p) => (
              <label key={p.id} className={`cursor-pointer rounded-full border px-3 py-1 text-sm ${currentProducts.includes(p.id) ? 'border-brand-700 bg-brand-50 text-brand-800' : 'border-slate-300 text-slate-600'}`}>
                <input type="checkbox" className="sr-only" checked={currentProducts.includes(p.id)} onChange={() => setProductIds(toggleIn(currentProducts, p.id))} />
                {p.name}
              </label>
            ))}
          </div>
        </div>
        <div className="sm:col-span-2">
          <ErrorBox error={save.error} />
        </div>
      </form>
    </Modal>
  );
}
