import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, CheckCircle2, Clock, Droplets, Loader, MapPin, PackageX, Wrench } from 'lucide-react';
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import { CHART_COLORS, STATUS_CHART_COLORS, fmtNum, label, monthStart, today } from '../lib/format';
import { useFilters } from '../components/hooks';
import { DateInput, FilterBar, PointFilter, ProductFilter, UserFilter } from '../components/Filters';
import { Card, Empty, ErrorBox, Kpi, Loading, PageHeader } from '../components/ui';

interface DashboardData {
  period: { from: string; to: string; granularity: 'day' | 'month' };
  kpis: {
    totalPoints: number;
    activePoints: number;
    tasksPending: number;
    tasksInProgress: number;
    tasksCompleted: number;
    incidentsOpen: number;
    incidentsInProgress: number;
    lowStockProducts: number;
    litersInPeriod: number;
    fillingsInPeriod: number;
  };
  lowStock: { id: number; name: string; unit: string; currentStock: number; minStock: number }[];
  consumptionByProduct: { name: string; unit: string; quantity: number }[];
  consumptionByPoint: { name: string; unit: string; quantity: number }[];
  tasksByStatus: { status: string; count: number }[];
  incidentsByStatus: { status: string; count: number }[];
  consumptionByPeriod: { period: string; quantity: number }[];
}

function StatusPie({ data }: { data: { status: string; count: number }[] }) {
  const rows = data.filter((d) => d.count > 0).map((d) => ({ name: label(d.status), value: d.count, status: d.status }));
  if (!rows.length) return <Empty text="Sin datos en el período" />;
  return (
    <ResponsiveContainer width="100%" height={240}>
      <PieChart>
        <Pie data={rows} dataKey="value" nameKey="name" innerRadius={50} outerRadius={85} paddingAngle={2}>
          {rows.map((r, i) => (
            <Cell key={r.status} fill={STATUS_CHART_COLORS[r.status] ?? CHART_COLORS[i % CHART_COLORS.length]} />
          ))}
        </Pie>
        <Tooltip />
        <Legend />
      </PieChart>
    </ResponsiveContainer>
  );
}

function QtyBar({ data, color }: { data: { name: string; unit: string; quantity: number }[]; color: string }) {
  if (!data.length) return <Empty text="Sin llenados en el período" />;
  return (
    <ResponsiveContainer width="100%" height={Math.max(200, data.length * 42)}>
      <BarChart data={data} layout="vertical" margin={{ left: 10, right: 24 }}>
        <CartesianGrid strokeDasharray="3 3" horizontal={false} />
        <XAxis type="number" tick={{ fontSize: 12 }} />
        <YAxis type="category" dataKey="name" width={110} tick={{ fontSize: 12 }} />
        <Tooltip formatter={(v: number, _n, p) => [`${fmtNum(v)} ${p.payload.unit}`, 'Cantidad llenada']} />
        <Bar dataKey="quantity" fill={color} radius={[0, 4, 4, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export default function Dashboard() {
  const { filters, set, reset } = useFilters({ from: monthStart(), to: today(), pointId: '', productId: '', userId: '' });
  const { data, isLoading, error } = useQuery({ queryKey: ['dashboard', filters], queryFn: () => api.get<DashboardData>('/dashboard', filters) });
  const k = data?.kpis;

  return (
    <>
      <PageHeader title="Dashboard" subtitle="Resumen operativo de los puntos de lavado" />
      <FilterBar onReset={reset}>
        <DateInput title="Fecha inicial" value={filters.from} onChange={(from) => set({ from })} />
        <DateInput title="Fecha final" value={filters.to} onChange={(to) => set({ to })} />
        <PointFilter value={filters.pointId} onChange={(pointId) => set({ pointId })} />
        <ProductFilter value={filters.productId} onChange={(productId) => set({ productId })} />
        <UserFilter value={filters.userId} onChange={(userId) => set({ userId })} />
      </FilterBar>
      <ErrorBox error={error} />
      {isLoading || !k || !data ? (
        <Loading />
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
            <Kpi label="Total de puntos" value={k.totalPoints} icon={<MapPin className="h-5 w-5" />} to="/puntos" />
            <Kpi label="Puntos activos" value={k.activePoints} icon={<CheckCircle2 className="h-5 w-5" />} tone="emerald" to="/puntos" />
            <Kpi label="Tareas pendientes" value={k.tasksPending} icon={<Clock className="h-5 w-5" />} tone="amber" to="/tareas?status=PENDIENTE" />
            <Kpi label="Tareas en proceso" value={k.tasksInProgress} icon={<Loader className="h-5 w-5" />} tone="indigo" to="/tareas?status=EN_PROCESO" />
            <Kpi label="Tareas completadas" value={k.tasksCompleted} icon={<CheckCircle2 className="h-5 w-5" />} tone="emerald" to="/tareas?status=COMPLETADA" />
            <Kpi label="Incidencias abiertas" value={k.incidentsOpen} icon={<AlertTriangle className="h-5 w-5" />} tone="red" to="/incidencias?status=ABIERTA" />
            <Kpi label="Incidencias en proceso" value={k.incidentsInProgress} icon={<Wrench className="h-5 w-5" />} tone="indigo" to="/incidencias?status=EN_PROCESO" />
            <Kpi label="Productos stock bajo" value={k.lowStockProducts} icon={<PackageX className="h-5 w-5" />} tone={k.lowStockProducts ? 'red' : 'slate'} to="/inventario" />
            <Kpi label="Litros llenados" value={`${fmtNum(k.litersInPeriod)} L`} icon={<Droplets className="h-5 w-5" />} />
            <Kpi label="Registros de llenado" value={k.fillingsInPeriod} icon={<Droplets className="h-5 w-5" />} tone="slate" to="/llenados" />
          </div>

          {data.lowStock.length > 0 && (
            <div className="rounded-xl border border-red-200 bg-red-50 p-4">
              <p className="mb-2 flex items-center gap-2 font-semibold text-red-800">
                <AlertTriangle className="h-5 w-5" /> Productos con stock bajo
              </p>
              <ul className="flex flex-wrap gap-2 text-sm">
                {data.lowStock.map((p) => (
                  <li key={p.id}>
                    <Link to="/inventario" className="rounded-full bg-white px-3 py-1 text-red-700 shadow-sm">
                      {p.name}: {fmtNum(p.currentStock)} {p.unit} (mín. {fmtNum(p.minStock)})
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="grid gap-4 lg:grid-cols-2">
            <Card title="Consumo por producto">
              <QtyBar data={data.consumptionByProduct} color="#0e7490" />
            </Card>
            <Card title="Consumo por punto">
              <QtyBar data={data.consumptionByPoint} color="#06b6d4" />
            </Card>
            <Card title="Tareas por estado">
              <StatusPie data={data.tasksByStatus} />
            </Card>
            <Card title="Incidencias por estado">
              <StatusPie data={data.incidentsByStatus} />
            </Card>
          </div>
          <Card title={`Consumo por período (${data.period.granularity === 'month' ? 'mensual' : 'diario'})`}>
            <ResponsiveContainer width="100%" height={260}>
              <AreaChart data={data.consumptionByPeriod} margin={{ left: 0, right: 12 }}>
                <defs>
                  <linearGradient id="gq" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#0e7490" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="#0e7490" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="period" tick={{ fontSize: 11 }} tickFormatter={(v: string) => (v.length > 7 ? v.slice(8, 10) + '/' + v.slice(5, 7) : v)} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip formatter={(v: number) => [fmtNum(v), 'Cantidad llenada']} />
                <Area type="monotone" dataKey="quantity" stroke="#0e7490" fill="url(#gq)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </Card>
        </div>
      )}
    </>
  );
}
