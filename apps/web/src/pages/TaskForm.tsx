import { useState, type FormEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { label, toLocalInput } from '../lib/format';
import type { Priority, Task } from '../lib/types';
import { useCatalogs, usePointOptions, useProductOptions, useUserOptions } from '../components/hooks';
import { Button, ErrorBox, Field, Modal } from '../components/ui';

export const PRIORITIES: Priority[] = ['BAJA', 'MEDIA', 'ALTA', 'URGENTE'];

export function AssigneeSelect({ value, onChange, pointId, required }: { value: string; onChange: (v: string) => void; pointId?: number; required?: boolean }) {
  const { data: users = [] } = useUserOptions();
  const candidates = users.filter((u) => u.role !== 'ADMIN');
  const inPoint = (u: (typeof users)[number]) => !pointId || u.points.some((p) => p.point.id === pointId);
  const sorted = [...candidates].sort((a, b) => Number(inPoint(b)) - Number(inPoint(a)) || a.name.localeCompare(b.name));
  return (
    <select className="input" value={value} onChange={(e) => onChange(e.target.value)} required={required}>
      <option value="">{required ? 'Seleccione…' : 'Sin asignar'}</option>
      {sorted.map((u) => (
        <option key={u.id} value={u.id}>
          {u.name} · {label(u.role)}
          {inPoint(u) ? '' : ' (no asociado al punto)'}
        </option>
      ))}
    </select>
  );
}

export function TaskForm({ task, onClose }: { task: Task | null; onClose: () => void }) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { data: catalogs } = useCatalogs();
  const { data: points = [] } = usePointOptions(true);
  const { data: products = [] } = useProductOptions();
  const [form, setForm] = useState({
    pointId: task ? String(task.pointId) : '',
    type: task?.type ?? 'LLENADO',
    productId: task?.product ? String(task.product.id) : '',
    description: task?.description ?? '',
    priority: task?.priority ?? ('MEDIA' as Priority),
    dueDate: toLocalInput(task?.dueDate),
    notes: task?.notes ?? '',
    assigneeId: task?.assignee ? String(task.assignee.id) : '',
  });
  const save = useMutation({
    mutationFn: () => {
      const body = {
        ...form,
        pointId: Number(form.pointId),
        productId: form.type === 'LLENADO' && form.productId ? Number(form.productId) : null,
        dueDate: form.dueDate ? new Date(form.dueDate).toISOString() : null,
        assigneeId: form.assigneeId ? Number(form.assigneeId) : null,
      };
      return task ? api.put<Task>(`/tasks/${task.id}`, body) : api.post<Task>('/tasks', body);
    },
    onSuccess: (t) => {
      qc.invalidateQueries({ queryKey: ['tasks'] });
      qc.invalidateQueries({ queryKey: ['task'] });
      onClose();
      if (!task) navigate(`/tareas/${t.id}`);
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
      title={task ? `Editar tarea #${task.id}` : 'Nueva tarea'}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button type="submit" form="task-form" loading={save.isPending}>Guardar</Button>
        </>
      }
    >
      <form id="task-form" onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
        <Field label="Punto de lavado *">
          <select className="input" value={form.pointId} onChange={(e) => setForm({ ...form, pointId: e.target.value })} required disabled={Boolean(task)}>
            <option value="">Seleccione…</option>
            {points.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </Field>
        <Field label="Tipo de tarea *">
          <select className="input" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
            {(catalogs?.taskTypes ?? []).map((t) => (
              <option key={t} value={t}>{label(t)}</option>
            ))}
          </select>
        </Field>
        {form.type === 'LLENADO' && (
          <Field label="Producto a llenar">
            <select className="input" value={form.productId} onChange={(e) => setForm({ ...form, productId: e.target.value })}>
              <option value="">Cualquiera</option>
              {products.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </Field>
        )}
        <Field label="Prioridad">
          <select className="input" value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value as Priority })}>
            {PRIORITIES.map((p) => (
              <option key={p} value={p}>{label(p)}</option>
            ))}
          </select>
        </Field>
        <Field label="Descripción *" className="sm:col-span-2">
          <textarea className="input" rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} required minLength={3} />
        </Field>
        <Field label="Fecha límite">
          <input className="input" type="datetime-local" value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} />
        </Field>
        {!task && (
          <Field label="Responsable">
            <AssigneeSelect value={form.assigneeId} onChange={(assigneeId) => setForm({ ...form, assigneeId })} pointId={Number(form.pointId) || undefined} />
          </Field>
        )}
        <Field label="Observaciones" className="sm:col-span-2">
          <textarea className="input" rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
        </Field>
        <div className="sm:col-span-2"><ErrorBox error={save.error} /></div>
      </form>
    </Modal>
  );
}
