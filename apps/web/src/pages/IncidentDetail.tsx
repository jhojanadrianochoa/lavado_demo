import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Camera, CheckCircle2, Lock, Pencil, Wrench } from 'lucide-react';
import { api } from '../lib/api';
import { fmtDateTime, label } from '../lib/format';
import type { Incident, IncidentStatus, Priority } from '../lib/types';
import { useAuth } from '../auth/AuthContext';
import { useCatalogs } from '../components/hooks';
import { PhotoGrid, PhotoUploadForm } from '../components/Photos';
import { Badge, Button, Card, ErrorBox, Field, InfoRow, Loading, Modal, PageHeader } from '../components/ui';
import { AssigneeSelect, PRIORITIES } from './TaskForm';

export default function IncidentDetail() {
  const id = Number(useParams().id);
  const { user, hasRole } = useAuth();
  const manager = hasRole('ADMIN', 'SUPERVISOR');
  const qc = useQueryClient();
  const { data: catalogs } = useCatalogs();
  const [modal, setModal] = useState<'edit' | 'status' | 'photo' | null>(null);
  const [nextStatus, setNextStatus] = useState<IncidentStatus>('EN_PROCESO');
  const [solution, setSolution] = useState('');
  const [form, setForm] = useState({ type: '', description: '', priority: 'MEDIA' as Priority, assigneeId: '' });
  const { data: i, isLoading, error } = useQuery({ queryKey: ['incident', id], queryFn: () => api.get<Incident>(`/incidents/${id}`) });
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['incident', id] });
    qc.invalidateQueries({ queryKey: ['incidents'] });
    setModal(null);
  };
  const changeStatus = useMutation({ mutationFn: () => api.patch(`/incidents/${id}/status`, { status: nextStatus, solution }), onSuccess: refresh });
  const update = useMutation({ mutationFn: () => api.put(`/incidents/${id}`, { ...form, assigneeId: form.assigneeId ? Number(form.assigneeId) : null }), onSuccess: refresh });

  if (isLoading) return <Loading />;
  if (error || !i) return <ErrorBox error={error ?? 'Incidencia no encontrada'} />;
  const isAssignee = i.assignee?.id === user?.id;
  const canSolve = manager || isAssignee;
  const openStatus = (s: IncidentStatus) => {
    setNextStatus(s);
    setSolution(i.solution ?? '');
    setModal('status');
  };

  return (
    <>
      <PageHeader
        back="/incidencias"
        title={<span className="flex flex-wrap items-center gap-2">Incidencia #{i.id} <Badge value={i.status} /> <Badge value={i.priority} /></span>}
        subtitle={`${label(i.type)} · ${i.point.name}`}
        actions={
          <>
            {manager && i.status !== 'CERRADA' && (
              <Button variant="secondary" onClick={() => { setForm({ type: i.type, description: i.description, priority: i.priority, assigneeId: i.assignee ? String(i.assignee.id) : '' }); setModal('edit'); }}>
                <Pencil className="h-4 w-4" /> Editar / asignar
              </Button>
            )}
            {i.status !== 'CERRADA' && (
              <Button variant="secondary" onClick={() => setModal('photo')}><Camera className="h-4 w-4" /> Fotos</Button>
            )}
          </>
        }
      />
      {canSolve && i.status !== 'CERRADA' && (
        <div className="mb-4 flex flex-wrap gap-2">
          {i.status === 'ABIERTA' && <Button onClick={() => openStatus('EN_PROCESO')}><Wrench className="h-4 w-4" /> Marcar en proceso</Button>}
          {(i.status === 'ABIERTA' || i.status === 'EN_PROCESO') && <Button className="bg-emerald-600 hover:bg-emerald-700" onClick={() => openStatus('SOLUCIONADA')}><CheckCircle2 className="h-4 w-4" /> Marcar solucionada</Button>}
          {manager && <Button variant="secondary" onClick={() => openStatus('CERRADA')}><Lock className="h-4 w-4" /> Cerrar incidencia</Button>}
        </div>
      )}
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card title="Descripción">
            <p className="whitespace-pre-line text-sm">{i.description}</p>
          </Card>
          {i.solution && (
            <Card title="Solución aplicada">
              <p className="whitespace-pre-line text-sm">{i.solution}</p>
            </Card>
          )}
          <Card title={`Fotografías (${i.photos?.length ?? 0})`}>
            <PhotoGrid photos={i.photos ?? []} />
          </Card>
        </div>
        <Card title="Detalle">
          <dl className="divide-y divide-slate-100">
            <InfoRow label="Punto">{manager ? <Link className="text-brand-700 hover:underline" to={`/puntos/${i.point.id}`}>{i.point.name}</Link> : i.point.name}</InfoRow>
            <InfoRow label="Tarea relacionada">{i.task ? <Link className="text-brand-700 hover:underline" to={`/tareas/${i.task.id}`}>#{i.task.id} · {i.task.description}</Link> : '—'}</InfoRow>
            <InfoRow label="Tipo">{label(i.type)}</InfoRow>
            <InfoRow label="Reportada por">{i.reportedBy.name}</InfoRow>
            <InfoRow label="Fecha">{fmtDateTime(i.createdAt)}</InfoRow>
            <InfoRow label="Responsable de solucionar">{i.assignee?.name ?? 'Sin asignar'}</InfoRow>
            <InfoRow label="Fecha de solución">{fmtDateTime(i.resolvedAt)}</InfoRow>
            <InfoRow label="Fecha de cierre">{fmtDateTime(i.closedAt)}</InfoRow>
          </dl>
        </Card>
      </div>

      <Modal
        open={modal === 'status'}
        onClose={() => setModal(null)}
        title={`Cambiar estado a "${label(nextStatus)}"`}
        footer={<Button onClick={() => changeStatus.mutate()} loading={changeStatus.isPending}>Confirmar</Button>}
      >
        {(nextStatus === 'SOLUCIONADA' || nextStatus === 'CERRADA') && (
          <Field label={`Solución aplicada${nextStatus === 'SOLUCIONADA' ? ' *' : ''}`}>
            <textarea className="input" rows={3} value={solution} onChange={(e) => setSolution(e.target.value)} />
          </Field>
        )}
        {nextStatus === 'EN_PROCESO' && <p className="text-sm text-slate-600">La incidencia quedará en proceso de solución.</p>}
        <div className="mt-3"><ErrorBox error={changeStatus.error} /></div>
      </Modal>
      <Modal
        open={modal === 'edit'}
        onClose={() => setModal(null)}
        title="Editar incidencia"
        footer={<Button onClick={() => update.mutate()} loading={update.isPending}>Guardar</Button>}
      >
        <div className="space-y-4">
          <Field label="Tipo">
            <select className="input" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
              {(catalogs?.incidentTypes ?? []).map((t) => <option key={t} value={t}>{label(t)}</option>)}
            </select>
          </Field>
          <Field label="Prioridad">
            <select className="input" value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value as Priority })}>
              {PRIORITIES.map((p) => <option key={p} value={p}>{label(p)}</option>)}
            </select>
          </Field>
          <Field label="Responsable de solucionar">
            <AssigneeSelect value={form.assigneeId} onChange={(assigneeId) => setForm({ ...form, assigneeId })} pointId={i.pointId} />
          </Field>
          <Field label="Descripción">
            <textarea className="input" rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </Field>
          <ErrorBox error={update.error} />
        </div>
      </Modal>
      <Modal open={modal === 'photo'} onClose={() => setModal(null)} title="Agregar fotografías">
        <PhotoUploadForm target={{ incidentId: i.id }} onDone={refresh} />
      </Modal>
    </>
  );
}
