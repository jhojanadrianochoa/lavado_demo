import { useState, type FormEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle } from 'lucide-react';
import { api } from '../lib/api';
import { label } from '../lib/format';
import type { Incident, Paged, Priority, Task } from '../lib/types';
import { useCatalogs, usePointOptions } from '../components/hooks';
import { PhotoPicker, uploadPhotos } from '../components/Photos';
import { Button, Card, ErrorBox, Field, PageHeader } from '../components/ui';
import { PRIORITIES } from './TaskForm';

export default function IncidentNew() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { data: catalogs } = useCatalogs();
  const { data: points = [] } = usePointOptions(true);
  const tasks = useQuery({ queryKey: ['tasks', 'open-mine'], queryFn: () => api.get<Paged<Task>>('/tasks', { open: 'true', mine: 'true', pageSize: 100 }) });
  const [form, setForm] = useState({ taskId: params.get('taskId') ?? '', pointId: '', type: 'FUGA', description: '', priority: 'MEDIA' as Priority });
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const taskFromList = tasks.data?.items.find((t) => t.id === Number(form.taskId));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const incident = await api.post<Incident>('/incidents', {
        taskId: form.taskId ? Number(form.taskId) : null,
        pointId: form.taskId ? null : Number(form.pointId),
        type: form.type,
        description: form.description,
        priority: form.priority,
      });
      if (files.length) await uploadPhotos(files, { type: 'INCIDENCIA', incidentId: incident.id });
      qc.invalidateQueries({ queryKey: ['incidents'] });
      qc.invalidateQueries({ queryKey: ['task'] });
      navigate(`/incidencias/${incident.id}`, { replace: true });
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-xl">
      <PageHeader title="Reportar incidencia" subtitle="Informe un problema encontrado en el punto o durante una tarea" back={form.taskId ? `/tareas/${form.taskId}` : undefined} />
      <Card>
        <form onSubmit={submit} className="space-y-4">
          <Field label="Tarea relacionada">
            <select className="input" value={form.taskId} onChange={(e) => setForm({ ...form, taskId: e.target.value })}>
              <option value="">Sin tarea</option>
              {form.taskId && !taskFromList && <option value={form.taskId}>Tarea #{form.taskId}</option>}
              {tasks.data?.items.map((t) => (
                <option key={t.id} value={t.id}>#{t.id} · {t.point.name} · {t.description}</option>
              ))}
            </select>
          </Field>
          {!form.taskId && (
            <Field label="Punto de lavado *">
              <select className="input" value={form.pointId} onChange={(e) => setForm({ ...form, pointId: e.target.value })} required>
                <option value="">Seleccione…</option>
                {points.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </Field>
          )}
          <Field label="Tipo de incidencia *">
            <div className="grid grid-cols-2 gap-2">
              {(catalogs?.incidentTypes ?? []).map((t) => (
                <button key={t} type="button" onClick={() => setForm({ ...form, type: t })} className={`rounded-lg border-2 px-2 py-2 text-sm font-medium ${form.type === t ? 'border-red-500 bg-red-50 text-red-800' : 'border-slate-200 text-slate-700'}`}>
                  {label(t)}
                </button>
              ))}
            </div>
          </Field>
          <Field label="Prioridad">
            <select className="input" value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value as Priority })}>
              {PRIORITIES.map((p) => <option key={p} value={p}>{label(p)}</option>)}
            </select>
          </Field>
          <Field label="Descripción *">
            <textarea className="input" rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} required minLength={3} placeholder="Describa el problema encontrado" />
          </Field>
          <div>
            <span className="label">Fotografías de la incidencia</span>
            <PhotoPicker files={files} onChange={setFiles} />
          </div>
          <ErrorBox error={error} />
          <Button type="submit" loading={busy} variant="danger" className="w-full py-3 text-base">
            <AlertTriangle className="h-5 w-5" /> Reportar incidencia
          </Button>
        </form>
      </Card>
    </div>
  );
}
