import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Ban, Camera, CheckCircle2, Droplets, MapPin, Pencil, Play, UserCog } from 'lucide-react';
import { api } from '../lib/api';
import { fmtDateTime, fmtQty, label } from '../lib/format';
import type { TaskDetail as TaskDetailT } from '../lib/types';
import { useAuth } from '../auth/AuthContext';
import { FillingForm } from '../components/FillingForm';
import { PhotoGrid, PhotoUploadForm } from '../components/Photos';
import { Badge, Button, Card, Empty, ErrorBox, Field, InfoRow, Loading, Modal, PageHeader, Table } from '../components/ui';
import { AssigneeSelect, TaskForm } from './TaskForm';

export default function TaskDetail() {
  const id = Number(useParams().id);
  const { user, hasRole } = useAuth();
  const qc = useQueryClient();
  const manager = hasRole('ADMIN', 'SUPERVISOR');
  const [modal, setModal] = useState<'assign' | 'edit' | 'cancel' | 'complete' | 'filling' | 'photo' | null>(null);
  const [assigneeId, setAssigneeId] = useState('');
  const [text, setText] = useState('');
  const { data: t, isLoading, error } = useQuery({ queryKey: ['task', id], queryFn: () => api.get<TaskDetailT>(`/tasks/${id}`) });

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['task', id] });
    qc.invalidateQueries({ queryKey: ['tasks'] });
    qc.invalidateQueries({ queryKey: ['notifications'] });
  };
  const action = useMutation({
    mutationFn: ({ path, body }: { path: string; body?: unknown }) => api.post(`/tasks/${id}/${path}`, body),
    onSuccess: () => {
      refresh();
      setModal(null);
      setText('');
    },
  });
  const deletePhoto = useMutation({ mutationFn: (pid: number) => api.del(`/photos/${pid}`), onSuccess: refresh });

  if (isLoading) return <Loading />;
  if (error || !t) return <ErrorBox error={error ?? 'Tarea no encontrada'} />;

  const isAssignee = t.assignee?.id === user?.id;
  const canWork = isAssignee || manager;
  const open = ['PENDIENTE', 'ASIGNADA', 'EN_PROCESO'].includes(t.status);
  const canStart = canWork && t.assignee && (t.status === 'PENDIENTE' || t.status === 'ASIGNADA');
  const canRegister = canWork && open && t.assignee;
  const canComplete = canWork && (t.status === 'EN_PROCESO' || t.status === 'ASIGNADA');
  const totalByUnit = t.fillings.reduce<Record<string, number>>((acc, f) => ({ ...acc, [f.unit]: (acc[f.unit] ?? 0) + f.quantity }), {});

  return (
    <>
      <PageHeader
        back="/tareas"
        title={
          <span className="flex flex-wrap items-center gap-2">
            Tarea #{t.id} <Badge value={t.status} /> <Badge value={t.priority} />
          </span>
        }
        subtitle={t.description}
        actions={
          manager &&
          open && (
            <>
              <Button variant="secondary" onClick={() => { setAssigneeId(t.assignee ? String(t.assignee.id) : ''); setModal('assign'); }}>
                <UserCog className="h-4 w-4" /> {t.assignee ? 'Reasignar' : 'Asignar'}
              </Button>
              <Button variant="secondary" onClick={() => setModal('edit')}><Pencil className="h-4 w-4" /> Editar</Button>
              <Button variant="secondary" onClick={() => setModal('cancel')}><Ban className="h-4 w-4" /> Cancelar</Button>
            </>
          )
        }
      />
      <ErrorBox error={action.error || deletePhoto.error} />

      {canWork && open && (
        <div className="mb-4 grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
          {canStart && (
            <Button onClick={() => action.mutate({ path: 'start' })} loading={action.isPending && action.variables?.path === 'start'} className="py-3">
              <Play className="h-5 w-5" /> Iniciar tarea
            </Button>
          )}
          {canRegister && (
            <Button onClick={() => setModal('filling')} className="py-3">
              <Droplets className="h-5 w-5" /> Registrar llenado
            </Button>
          )}
          {canRegister && (
            <Button variant="secondary" onClick={() => setModal('photo')} className="py-3">
              <Camera className="h-5 w-5" /> Subir fotos
            </Button>
          )}
          <Link to={`/incidencias/nueva?taskId=${t.id}`} className="btn-secondary py-3">
            <AlertTriangle className="h-5 w-5" /> Reportar incidencia
          </Link>
          {canComplete && (
            <Button onClick={() => setModal('complete')} className="col-span-2 bg-emerald-600 py-3 hover:bg-emerald-700">
              <CheckCircle2 className="h-5 w-5" /> Completar tarea
            </Button>
          )}
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card title="Llenados registrados" actions={t.fillings.length > 0 && <span className="text-sm font-semibold text-brand-700">Total: {Object.entries(totalByUnit).map(([u, q]) => fmtQty(q, u)).join(' · ')}</span>} bodyClass="">
            {t.fillings.length ? (
              <Table head={<tr><th className="th">Fecha y hora</th><th className="th">Producto</th><th className="th text-right">Cantidad llenada</th><th className="th hidden sm:table-cell">Realizado por</th><th className="th hidden md:table-cell">Observación</th></tr>}>
                {t.fillings.map((f) => (
                  <tr key={f.id}>
                    <td className="td whitespace-nowrap">{fmtDateTime(f.filledAt)}</td>
                    <td className="td">{f.product.name}</td>
                    <td className="td whitespace-nowrap text-right font-semibold">{fmtQty(f.quantity, f.unit)}</td>
                    <td className="td hidden sm:table-cell">{f.user.name}</td>
                    <td className="td hidden md:table-cell">{f.notes ?? '—'}</td>
                  </tr>
                ))}
              </Table>
            ) : (
              <Empty text={t.type === 'LLENADO' ? 'Aún no se registran llenados. Registre la cantidad realmente llenada.' : 'Sin llenados'} icon={<Droplets className="h-8 w-8 text-slate-300" />} />
            )}
          </Card>
          <Card title={`Fotografías (${t.photos.length})`}>
            <PhotoGrid photos={t.photos} onDelete={manager || isAssignee ? (pid) => deletePhoto.mutate(pid) : undefined} />
          </Card>
          <Card title={`Incidencias (${t.incidents.length})`} bodyClass="">
            {t.incidents.length ? (
              <ul className="divide-y divide-slate-100">
                {t.incidents.map((i) => (
                  <li key={i.id}>
                    <Link to={`/incidencias/${i.id}`} className="flex items-center justify-between gap-2 px-4 py-3 hover:bg-slate-50">
                      <div>
                        <p className="font-medium">{label(i.type)}</p>
                        <p className="text-sm text-slate-500">{i.description}</p>
                        <p className="text-xs text-slate-400">{fmtDateTime(i.createdAt)} · {i.reportedBy.name}</p>
                      </div>
                      <Badge value={i.status} />
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <Empty text="Sin incidencias" />
            )}
          </Card>
        </div>
        <div className="space-y-4">
          <Card title="Detalle">
            <dl className="divide-y divide-slate-100">
              <InfoRow label="Punto">
                <span className="flex items-start gap-1">
                  <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-brand-700" />
                  <span>
                    {manager ? <Link className="text-brand-700 hover:underline" to={`/puntos/${t.point.id}`}>{t.point.name}</Link> : t.point.name}
                    <br />
                    <span className="text-xs font-normal text-slate-500">{t.point.address}, {t.point.city}</span>
                  </span>
                </span>
              </InfoRow>
              <InfoRow label="Tipo">{label(t.type)}</InfoRow>
              {t.product && <InfoRow label="Producto">{t.product.name}</InfoRow>}
              <InfoRow label="Responsable">{t.assignee?.name ?? 'Sin asignar'}</InfoRow>
              <InfoRow label="Creada por">{t.createdBy.name}</InfoRow>
              <InfoRow label="Fecha de creación">{fmtDateTime(t.createdAt)}</InfoRow>
              <InfoRow label="Fecha límite">{t.dueDate ? fmtDateTime(t.dueDate) : '—'}</InfoRow>
              <InfoRow label="Asignada">{fmtDateTime(t.assignedAt)}</InfoRow>
              <InfoRow label="Inicio">{fmtDateTime(t.startedAt)}</InfoRow>
              <InfoRow label="Finalización">{fmtDateTime(t.completedAt)}</InfoRow>
              {t.requirement && <InfoRow label="Requerimiento">#{t.requirement.id} · {label(t.requirement.type)}</InfoRow>}
              <InfoRow label="Observaciones"><span className="whitespace-pre-line">{t.notes}</span></InfoRow>
            </dl>
          </Card>
        </div>
      </div>

      <Modal open={modal === 'filling'} onClose={() => setModal(null)} title="Registrar llenado">
        <FillingForm taskId={t.id} defaultProductId={t.product?.id} onSaved={() => { refresh(); qc.invalidateQueries({ queryKey: ['products'] }); setModal(null); }} />
      </Modal>
      <Modal open={modal === 'photo'} onClose={() => setModal(null)} title="Subir fotografías">
        <PhotoUploadForm target={{ taskId: t.id }} onDone={() => { refresh(); setModal(null); }} />
      </Modal>
      <Modal
        open={modal === 'assign'}
        onClose={() => setModal(null)}
        title={t.assignee ? 'Reasignar tarea' : 'Asignar tarea'}
        footer={<Button onClick={() => action.mutate({ path: 'assign', body: { assigneeId: Number(assigneeId) } })} loading={action.isPending} disabled={!assigneeId}>Guardar</Button>}
      >
        <Field label="Responsable">
          <AssigneeSelect value={assigneeId} onChange={setAssigneeId} pointId={t.pointId} required />
        </Field>
        <div className="mt-3"><ErrorBox error={action.error} /></div>
      </Modal>
      <Modal
        open={modal === 'cancel'}
        onClose={() => setModal(null)}
        title="Cancelar tarea"
        footer={<Button variant="danger" onClick={() => action.mutate({ path: 'cancel', body: { reason: text } })} loading={action.isPending} disabled={text.trim().length < 3}>Cancelar tarea</Button>}
      >
        <Field label="Motivo de la cancelación">
          <textarea className="input" rows={3} value={text} onChange={(e) => setText(e.target.value)} />
        </Field>
        <div className="mt-3"><ErrorBox error={action.error} /></div>
      </Modal>
      <Modal
        open={modal === 'complete'}
        onClose={() => setModal(null)}
        title="Completar tarea"
        footer={<Button onClick={() => action.mutate({ path: 'complete', body: { notes: text } })} loading={action.isPending} className="bg-emerald-600 hover:bg-emerald-700">Confirmar</Button>}
      >
        {t.type === 'LLENADO' && (
          <p className="mb-3 rounded-lg bg-brand-50 p-3 text-sm text-brand-800">
            Llenados registrados: {t.fillings.length ? Object.entries(totalByUnit).map(([u, q]) => fmtQty(q, u)).join(' · ') : 'ninguno'}
          </p>
        )}
        <Field label="Observación final (opcional)">
          <textarea className="input" rows={3} value={text} onChange={(e) => setText(e.target.value)} />
        </Field>
        <div className="mt-3"><ErrorBox error={action.error} /></div>
      </Modal>
      {modal === 'edit' && <TaskForm task={t} onClose={() => setModal(null)} />}
    </>
  );
}
