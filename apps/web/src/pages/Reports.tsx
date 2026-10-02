import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { FileDown, FileSpreadsheet, FileText, Play } from 'lucide-react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { api, qs } from '../lib/api';
import { fmtDateTime, monthStart, today } from '../lib/format';
import { useAuth } from '../auth/AuthContext';
import { usePointOptions, useProductOptions, useUserOptions } from '../components/hooks';
import { Button, Card, Empty, ErrorBox, Field, Kpi, Loading, PageHeader, Table } from '../components/ui';

type Cell = string | number | null;
interface ReportSection {
  title: string;
  columns: { key: string; label: string; align?: 'left' | 'right' }[];
  rows: Record<string, Cell>[];
  totals?: Record<string, Cell>;
  chart?: { title: string; labelKey: string; valueKey: string };
  emptyText?: string;
}
interface Report {
  type: string;
  title: string;
  generatedAt: string;
  period: { from: string; to: string };
  filters: { label: string; value: string }[];
  kpis: { label: string; value: string }[];
  sections: ReportSection[];
}

const STATUS_OPTIONS = ['PENDIENTE', 'ASIGNADA', 'EN_PROCESO', 'COMPLETADA', 'CANCELADA', 'ABIERTA', 'SOLUCIONADA', 'CERRADA'];
const cell = (v: Cell) => (v === null || v === undefined ? '' : typeof v === 'number' ? v.toLocaleString('es-CO', { maximumFractionDigits: 2 }) : v);

function SectionView({ s }: { s: ReportSection }) {
  const chartData = s.chart ? s.rows.filter((r) => typeof r[s.chart!.valueKey] === 'number').slice(0, 15) : [];
  return (
    <Card title={s.title} bodyClass="">
      {s.chart && chartData.length > 0 && (
        <div className="border-b border-slate-100 p-4">
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey={s.chart.labelKey} tick={{ fontSize: 11 }} interval={0} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip />
              <Bar dataKey={s.chart.valueKey} fill="#0e7490" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
      {s.rows.length ? (
        <Table head={<tr>{s.columns.map((c) => <th key={c.key} className={`th ${c.align === 'right' ? 'text-right' : ''}`}>{c.label}</th>)}</tr>}>
          {s.rows.map((r, i) => (
            <tr key={i}>
              {s.columns.map((c) => <td key={c.key} className={`td ${c.align === 'right' ? 'text-right' : ''}`}>{cell(r[c.key])}</td>)}
            </tr>
          ))}
          {s.totals && (
            <tr className="bg-slate-50 font-semibold">
              {s.columns.map((c) => <td key={c.key} className={`td ${c.align === 'right' ? 'text-right' : ''}`}>{cell(s.totals![c.key] ?? null)}</td>)}
            </tr>
          )}
        </Table>
      ) : (
        <Empty text={s.emptyText ?? 'Sin datos'} />
      )}
    </Card>
  );
}

export default function Reports() {
  const { hasRole } = useAuth();
  const { data: types = [] } = useQuery({ queryKey: ['report-types'], queryFn: () => api.get<{ value: string; label: string }[]>('/reports/types'), staleTime: Infinity });
  const { data: points = [] } = usePointOptions();
  const { data: products = [] } = useProductOptions(false);
  const { data: users = [] } = useUserOptions();
  const [form, setForm] = useState({ type: 'consumo-productos', from: monthStart(), to: today(), pointId: '', productId: '', userId: '', status: '' });
  const [submitted, setSubmitted] = useState<typeof form | null>(null);
  const report = useQuery({ queryKey: ['report', submitted], queryFn: () => api.get<Report>(`/reports/${submitted!.type}`, { ...submitted, type: undefined, format: 'json' }), enabled: Boolean(submitted) });
  const needsPoint = form.type === 'punto';
  const href = (format: 'pdf' | 'xlsx' | 'csv') => `/api/reports/${form.type}${qs({ ...form, type: undefined, format })}`;
  const disabled = needsPoint && !form.pointId;

  return (
    <>
      <PageHeader title="Informes" subtitle={hasRole('ADMIN') ? 'Genere y exporte informes de toda la operación' : 'Informes de los puntos bajo su responsabilidad'} />
      <Card className="mb-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Tipo de informe" className="sm:col-span-2">
            <select className="input" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
              {types.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </Field>
          <Field label="Fecha inicial">
            <input className="input" type="date" value={form.from} onChange={(e) => setForm({ ...form, from: e.target.value })} />
          </Field>
          <Field label="Fecha final">
            <input className="input" type="date" value={form.to} onChange={(e) => setForm({ ...form, to: e.target.value })} />
          </Field>
          <Field label={needsPoint ? 'Punto *' : 'Punto'}>
            <select className="input" value={form.pointId} onChange={(e) => setForm({ ...form, pointId: e.target.value })}>
              <option value="">{needsPoint ? 'Seleccione…' : 'Todos los puntos'}</option>
              {points.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </Field>
          <Field label="Producto">
            <select className="input" value={form.productId} onChange={(e) => setForm({ ...form, productId: e.target.value })}>
              <option value="">Todos los productos</option>
              {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </Field>
          <Field label="Usuario">
            <select className="input" value={form.userId} onChange={(e) => setForm({ ...form, userId: e.target.value })}>
              <option value="">Todos los usuarios</option>
              {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
          </Field>
          <Field label="Estado">
            <select className="input" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
              <option value="">Todos los estados</option>
              {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{s.replace('_', ' ').toLowerCase()}</option>)}
            </select>
          </Field>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button onClick={() => setSubmitted({ ...form })} disabled={disabled}><Play className="h-4 w-4" /> Generar vista previa</Button>
          <a className={`btn-secondary ${disabled ? 'pointer-events-none opacity-50' : ''}`} href={href('pdf')} download><FileText className="h-4 w-4 text-red-600" /> PDF</a>
          <a className={`btn-secondary ${disabled ? 'pointer-events-none opacity-50' : ''}`} href={href('xlsx')} download><FileSpreadsheet className="h-4 w-4 text-emerald-600" /> Excel</a>
          <a className={`btn-secondary ${disabled ? 'pointer-events-none opacity-50' : ''}`} href={href('csv')} download><FileDown className="h-4 w-4" /> CSV</a>
        </div>
      </Card>
      <ErrorBox error={report.error} />
      {report.isFetching && <Loading text="Generando informe…" />}
      {report.data && !report.isFetching && (
        <div className="space-y-4">
          <div>
            <h2 className="text-lg font-bold">{report.data.title}</h2>
            <p className="text-sm text-slate-500">
              Período: {report.data.period.from} – {report.data.period.to} · Generado: {fmtDateTime(report.data.generatedAt)}
            </p>
            {report.data.filters.length > 0 && <p className="text-xs text-slate-500">Filtros: {report.data.filters.map((f) => `${f.label}: ${f.value}`).join(' · ')}</p>}
          </div>
          {report.data.kpis.length > 0 && (
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              {report.data.kpis.map((k) => <Kpi key={k.label} label={k.label} value={k.value} />)}
            </div>
          )}
          {report.data.sections.map((s, i) => <SectionView key={i} s={s} />)}
        </div>
      )}
    </>
  );
}
