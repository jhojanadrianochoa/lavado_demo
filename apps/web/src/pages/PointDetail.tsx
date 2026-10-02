import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Pencil } from 'lucide-react';
import { api } from '../lib/api';
import { fmtDate, fmtNum, fmtQty, label, monthStart, today } from '../lib/format';
import type { Filling, HistoryEntry, Incident, Paged, PhotoItem, Point, Task } from '../lib/types';
import { useAuth } from '../auth/AuthContext';
import { DateInput } from '../components/Filters';
import { FillingTable, HistoryList, IncidentTable, TaskTable } from '../components/lists';
import { PhotoGrid } from '../components/Photos';
import { ActiveBadge, Badge, Button, Card, Empty, ErrorBox, InfoRow, Kpi, Loading, PageHeader, Table, Tabs } from '../components/ui';
import { PointForm } from './PointForm';

type Tab = 'info' | 'tareas' | 'llenados' | 'incidencias' | 'fotos' | 'historial' | 'estadisticas';

interface Stats {
  consumption: { productId: number; product: string; unit: string; quantity: number; fillings: number }[];
  tasksByStatus: { status: string; count: number }[];
  incidentsByStatus: { status: string; count: number }[];
  totalFillings: number;
}

export default function PointDetail() {
  const id = Number(useParams().id);
  const { hasRole } = useAuth();
  const [tab, setTab] = useState<Tab>('info');
  const [editing, setEditing] = useState(false);
  const [range, setRange] = useState({ from: monthStart(), to: today() });
  const point = useQuery({ queryKey: ['point', id], queryFn: () => api.get<Point>(`/points/${id}`) });
  const tasks = useQuery({ queryKey: ['tasks', { pointId: id }], queryFn: () => api.get<Paged<Task>>('/tasks', { pointId: id, pageSize: 50 }), enabled: tab === 'tareas' });
  const fillings = useQuery({ queryKey: ['fillings', { pointId: id }], queryFn: () => api.get<Paged<Filling>>('/fillings', { pointId: id, pageSize: 50 }), enabled: tab === 'llenados' });
  const incidents = useQuery({ queryKey: ['incidents', { pointId: id }], queryFn: () => api.get<Paged<Incident>>('/incidents', { pointId: id, pageSize: 50 }), enabled: tab === 'incidencias' });
  const photos = useQuery({ queryKey: ['photos', { pointId: id }], queryFn: () => api.get<Paged<PhotoItem>>('/photos', { pointId: id, pageSize: 60 }), enabled: tab === 'fotos' });
  const history = useQuery({ queryKey: ['history', { pointId: id }], queryFn: () => api.get<{ items: HistoryEntry[] }>('/history', { pointId: id, pageSize: 50 }), enabled: tab === 'historial' });
  const stats = useQuery({ queryKey: ['point-stats', id, range], queryFn: () => api.get<Stats>(`/points/${id}/stats`, range), enabled: tab === 'estadisticas' });

  if (point.isLoading) return <Loading />;
  if (point.error || !point.data) return <ErrorBox error={point.error ?? 'Punto no encontrado'} />;
  const p = point.data;

  return (
    <>
      <PageHeader
        back="/puntos"
        title={p.name}
        subtitle={`${p.code} · ${p.address}, ${p.city}`}
        actions={
          hasRole('ADMIN') && (
            <Button variant="secondary" onClick={() => setEditing(true)}>
              <Pencil className="h-4 w-4" /> Editar
            </Button>
          )
        }
      />
      <Tabs<Tab>
        value={tab}
        onChange={setTab}
        tabs={[
          { value: 'info', label: 'Información' },
          { value: 'tareas', label: 'Tareas' },
          { value: 'llenados', label: 'Llenados' },
          { value: 'incidencias', label: 'Incidencias' },
          { value: 'fotos', label: 'Fotografías' },
          { value: 'historial', label: 'Historial' },
          { value: 'estadisticas', label: 'Estadísticas' },
        ]}
      />

      {tab === 'info' && (
        <div className="grid gap-4 lg:grid-cols-3">
          <Card title="Información del punto" className="lg:col-span-2">
            <dl className="divide-y divide-slate-100">
              <InfoRow label="ID">{p.id}</InfoRow>
              <InfoRow label="Código">{p.code}</InfoRow>
              <InfoRow label="Nombre">{p.name}</InfoRow>
              <InfoRow label="Dirección">{p.address}</InfoRow>
              <InfoRow label="Ciudad / localidad">{p.city}</InfoRow>
              <InfoRow label="Estado">
                <ActiveBadge active={p.active} />
              </InfoRow>
              <InfoRow label="Encargado">{p.manager?.name}</InfoRow>
              <InfoRow label="Fecha de creación">{fmtDate(p.createdAt)}</InfoRow>
              <InfoRow label="Observaciones">{p.notes}</InfoRow>
            </dl>
          </Card>
          <div className="space-y-4">
            <Card title="Usuarios asociados">
              {p.users?.length ? (
                <ul className="space-y-2">
                  {p.users.map(({ user }) => (
                    <li key={user.id} className="flex items-center justify-between text-sm">
                      <span>{user.name}</span>
                      <span className="text-xs text-slate-500">{label(user.role)}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <Empty text="Sin usuarios asociados" />
              )}
            </Card>
            <Card title="Productos utilizados">
              {p.products?.length ? (
                <ul className="space-y-2">
                  {p.products.map(({ product }) => (
                    <li key={product.id} className="flex items-center justify-between text-sm">
                      <span>{product.name}</span>
                      <span className="text-xs text-slate-500">Stock general: {fmtQty(product.currentStock ?? 0, product.unit ?? '')}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <Empty text="Sin productos" />
              )}
            </Card>
          </div>
        </div>
      )}

      {tab === 'tareas' && <Card bodyClass="">{tasks.isLoading ? <Loading /> : <TaskTable items={tasks.data?.items ?? []} showPoint={false} />}</Card>}
      {tab === 'llenados' && <Card bodyClass="">{fillings.isLoading ? <Loading /> : <FillingTable items={fillings.data?.items ?? []} showPoint={false} />}</Card>}
      {tab === 'incidencias' && <Card bodyClass="">{incidents.isLoading ? <Loading /> : <IncidentTable items={incidents.data?.items ?? []} showPoint={false} />}</Card>}
      {tab === 'fotos' && <Card>{photos.isLoading ? <Loading /> : <PhotoGrid photos={photos.data?.items ?? []} />}</Card>}
      {tab === 'historial' && <Card bodyClass="">{history.isLoading ? <Loading /> : <HistoryList items={history.data?.items ?? []} />}</Card>}
      {tab === 'estadisticas' && (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <DateInput title="Desde" value={range.from} onChange={(from) => setRange({ ...range, from })} />
            <DateInput title="Hasta" value={range.to} onChange={(to) => setRange({ ...range, to })} />
          </div>
          {stats.isLoading || !stats.data ? (
            <Loading />
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                <Kpi label="Llenados" value={stats.data.totalFillings} />
                <Kpi label="Cantidad total" value={fmtNum(stats.data.consumption.reduce((a, c) => a + c.quantity, 0))} />
                <Kpi label="Tareas" value={stats.data.tasksByStatus.reduce((a, c) => a + c.count, 0)} tone="indigo" />
                <Kpi label="Incidencias" value={stats.data.incidentsByStatus.reduce((a, c) => a + c.count, 0)} tone="red" />
              </div>
              <div className="grid gap-4 lg:grid-cols-2">
                <Card title="Consumo por producto">
                  {stats.data.consumption.length ? (
                    <ResponsiveContainer width="100%" height={240}>
                      <BarChart data={stats.data.consumption}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} />
                        <XAxis dataKey="product" tick={{ fontSize: 12 }} />
                        <YAxis tick={{ fontSize: 12 }} />
                        <Tooltip formatter={(v: number) => [fmtNum(v), 'Cantidad llenada']} />
                        <Bar dataKey="quantity" fill="#0e7490" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  ) : (
                    <Empty text="Sin llenados en el período" />
                  )}
                </Card>
                <Card title="Tareas e incidencias por estado" bodyClass="">
                  <Table head={<tr><th className="th">Estado</th><th className="th text-right">Cantidad</th></tr>}>
                    {[...stats.data.tasksByStatus, ...stats.data.incidentsByStatus].map((s, i) => (
                      <tr key={i}>
                        <td className="td"><Badge value={s.status} /></td>
                        <td className="td text-right">{s.count}</td>
                      </tr>
                    ))}
                  </Table>
                </Card>
              </div>
            </>
          )}
        </div>
      )}
      {editing && <PointForm point={p} onClose={() => setEditing(false)} />}
    </>
  );
}
