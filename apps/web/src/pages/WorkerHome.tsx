import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, ChevronRight, ClipboardList, Droplets, ListChecks, MapPin } from 'lucide-react';
import { api } from '../lib/api';
import { fmtDateTime, label } from '../lib/format';
import type { Paged, Task } from '../lib/types';
import { useAuth } from '../auth/AuthContext';
import { Badge, Card, Empty, Loading } from '../components/ui';

export default function WorkerHome() {
  const { user } = useAuth();
  const { data, isLoading } = useQuery({ queryKey: ['tasks', 'open-mine'], queryFn: () => api.get<Paged<Task>>('/tasks', { open: 'true', mine: 'true', pageSize: 100 }) });
  const tasks = data?.items ?? [];
  const inProgress = tasks.filter((t) => t.status === 'EN_PROCESO');
  const pending = tasks.filter((t) => t.status !== 'EN_PROCESO');
  const actions = [
    { to: '/tareas', label: 'Mis tareas', icon: ListChecks, cls: 'bg-indigo-600' },
    { to: '/llenados/nuevo', label: 'Registrar llenado', icon: Droplets, cls: 'bg-brand-700' },
    { to: '/incidencias/nueva', label: 'Reportar incidencia', icon: AlertTriangle, cls: 'bg-red-600' },
    { to: '/requerimientos', label: 'Requerimientos', icon: ClipboardList, cls: 'bg-amber-600' },
  ];
  const TaskItem = ({ t }: { t: Task }) => (
    <li>
      <Link to={`/tareas/${t.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium">{t.description}</span>
            <Badge value={t.priority} />
          </div>
          <p className="mt-0.5 flex items-center gap-1 text-sm text-slate-500">
            <MapPin className="h-3.5 w-3.5" /> {t.point.name} · {label(t.type)}
            {t.product ? ` · ${t.product.name}` : ''}
          </p>
          {t.dueDate && <p className="text-xs text-slate-400">Vence: {fmtDateTime(t.dueDate)}</p>}
        </div>
        <ChevronRight className="h-5 w-5 text-slate-400" />
      </Link>
    </li>
  );
  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div>
        <h1 className="text-xl font-bold">Hola, {user?.name.split(' ')[0]}</h1>
        <p className="text-sm text-slate-500">
          Tiene {tasks.length} {tasks.length === 1 ? 'tarea abierta' : 'tareas abiertas'}
        </p>
      </div>
      <div className="grid grid-cols-2 gap-3">
        {actions.map((a) => (
          <Link key={a.to} to={a.to} className={`flex flex-col items-start gap-2 rounded-xl p-4 text-white shadow-sm ${a.cls}`}>
            <a.icon className="h-6 w-6" />
            <span className="font-semibold">{a.label}</span>
          </Link>
        ))}
      </div>
      {isLoading ? (
        <Loading />
      ) : (
        <>
          {inProgress.length > 0 && (
            <Card title="En proceso" bodyClass="">
              <ul className="divide-y divide-slate-100">{inProgress.map((t) => <TaskItem key={t.id} t={t} />)}</ul>
            </Card>
          )}
          <Card title="Pendientes por iniciar" bodyClass="">
            {pending.length ? <ul className="divide-y divide-slate-100">{pending.map((t) => <TaskItem key={t.id} t={t} />)}</ul> : <Empty text="No tiene tareas pendientes" />}
          </Card>
        </>
      )}
    </div>
  );
}
