import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2 } from 'lucide-react';
import { api } from '../lib/api';
import { fmtDateTime, fmtQty } from '../lib/format';
import type { Filling, Paged, Task } from '../lib/types';
import { usePointOptions } from '../components/hooks';
import { FillingForm } from '../components/FillingForm';
import { Card, Field, PageHeader } from '../components/ui';

export default function FillingNew() {
  const qc = useQueryClient();
  const { data: points = [] } = usePointOptions(true);
  const [pointId, setPointId] = useState('');
  const [taskId, setTaskId] = useState('');
  const [saved, setSaved] = useState<Filling | null>(null);
  const tasks = useQuery({ queryKey: ['tasks', 'open-mine'], queryFn: () => api.get<Paged<Task>>('/tasks', { open: 'true', mine: 'true', pageSize: 100 }) });
  const task = tasks.data?.items.find((t) => t.id === Number(taskId));
  const effectivePoint = task ? task.pointId : Number(pointId) || null;

  return (
    <div className="mx-auto max-w-xl">
      <PageHeader title="Registrar llenado" subtitle="Registre la cantidad realmente llenada en el punto" />
      {saved && (
        <div className="mb-4 flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-800">
          <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" />
          <div className="text-sm">
            <p className="font-semibold">Llenado registrado</p>
            <p>
              {saved.product.name}: {fmtQty(saved.quantity, saved.unit)} en {saved.point.name} · {fmtDateTime(saved.filledAt)}
            </p>
            {saved.task && <Link className="font-medium underline" to={`/tareas/${saved.task.id}`}>Ver tarea #{saved.task.id}</Link>}
          </div>
        </div>
      )}
      <Card>
        <div className="mb-4 grid gap-4">
          <Field label="Tarea relacionada">
            <select className="input" value={taskId} onChange={(e) => setTaskId(e.target.value)}>
              <option value="">Sin tarea (llenado directo en un punto)</option>
              {tasks.data?.items.map((t) => (
                <option key={t.id} value={t.id}>#{t.id} · {t.point.name} · {t.description}</option>
              ))}
            </select>
          </Field>
          {!task && (
            <Field label="Punto de lavado *">
              <select className="input" value={pointId} onChange={(e) => setPointId(e.target.value)} required>
                <option value="">Seleccione…</option>
                {points.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </Field>
          )}
        </div>
        {effectivePoint ? (
          <FillingForm
            key={`${taskId}-${pointId}`}
            taskId={task?.id ?? null}
            pointId={effectivePoint}
            defaultProductId={task?.product?.id}
            onSaved={(f) => {
              setSaved(f);
              qc.invalidateQueries({ queryKey: ['tasks'] });
              qc.invalidateQueries({ queryKey: ['fillings'] });
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
          />
        ) : (
          <p className="text-sm text-slate-500">Seleccione una tarea o un punto de lavado para continuar.</p>
        )}
      </Card>
    </div>
  );
}
