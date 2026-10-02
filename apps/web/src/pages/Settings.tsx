import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Upload } from 'lucide-react';
import { api } from '../lib/api';
import { fmtDateTime } from '../lib/format';
import type { Paged, SettingsData } from '../lib/types';
import { useFilters } from '../components/hooks';
import { DateInput, FilterBar, SelectFilter, UserFilter } from '../components/Filters';
import { Button, Card, ErrorBox, Field, Loading, PageHeader, Pagination, Table, Tabs } from '../components/ui';

interface AuditItem {
  id: number;
  action: string;
  entity: string;
  entityId: number | null;
  details: unknown;
  ip: string | null;
  createdAt: string;
  user: { id: number; name: string; username: string } | null;
}

const ACTION_LABELS: Record<string, string> = {
  LOGIN: 'Inicio de sesión',
  USER_CREATED: 'Usuario creado',
  USER_UPDATED: 'Usuario modificado',
  USER_ACTIVATED: 'Usuario activado',
  USER_DEACTIVATED: 'Usuario desactivado',
  PASSWORD_RESET: 'Contraseña restablecida',
  PASSWORD_CHANGED: 'Contraseña propia cambiada',
  POINT_CREATED: 'Punto creado',
  POINT_UPDATED: 'Punto modificado',
  POINT_ACTIVATED: 'Punto activado',
  POINT_DEACTIVATED: 'Punto desactivado',
  PRODUCT_CREATED: 'Producto creado',
  PRODUCT_UPDATED: 'Producto modificado',
  INVENTORY_MOVEMENT: 'Inventario modificado',
  TASK_CREATED: 'Tarea creada',
  TASK_UPDATED: 'Tarea modificada',
  TASK_ASSIGNED: 'Tarea asignada',
  TASK_REASSIGNED: 'Tarea reasignada',
  TASK_STARTED: 'Tarea iniciada',
  TASK_COMPLETED: 'Tarea completada',
  TASK_CANCELLED: 'Tarea cancelada',
  FILLING_REGISTERED: 'Llenado registrado',
  INCIDENT_CREATED: 'Incidencia creada',
  INCIDENT_UPDATED: 'Incidencia modificada',
  INCIDENT_STATUS: 'Estado de incidencia',
  INCIDENT_RESOLVED: 'Incidencia solucionada',
  INCIDENT_CLOSED: 'Incidencia cerrada',
  REQUIREMENT_CREATED: 'Requerimiento creado',
  REQUIREMENT_UPDATED: 'Requerimiento modificado',
  REQUIREMENT_STATUS: 'Estado de requerimiento',
  PHOTO_DELETED: 'Fotografía eliminada',
  REPORT_EXPORTED: 'Informe exportado',
  LOGO_UPDATED: 'Logo actualizado',
  REQUIREMENT_CONVERTED: 'Requerimiento convertido en tarea',
  SETTINGS_UPDATED: 'Configuración modificada',
};

function GeneralSettings() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ['settings'], queryFn: () => api.get<SettingsData>('/settings') });
  const [form, setForm] = useState({ companyName: '', autoDeductInventory: true, requirePhotoOnComplete: false, dueSoonHours: '24' });
  const [saved, setSaved] = useState(false);
  useEffect(() => {
    if (data) setForm({ companyName: data.companyName, autoDeductInventory: data.autoDeductInventory === 'true', requirePhotoOnComplete: data.requirePhotoOnComplete === 'true', dueSoonHours: data.dueSoonHours });
  }, [data]);
  const save = useMutation({
    mutationFn: () => api.put('/settings', { ...form, dueSoonHours: Number(form.dueSoonHours) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['settings'] });
      qc.invalidateQueries({ queryKey: ['branding'] });
      setSaved(true);
    },
  });
  const logo = useMutation({
    mutationFn: (file: File) => {
      const fd = new FormData();
      fd.append('file', file);
      return api.post('/settings/logo', fd);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['settings'] });
      qc.invalidateQueries({ queryKey: ['branding'] });
    },
  });
  if (isLoading) return <Loading />;
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card title="Empresa y operación">
        <div className="space-y-4">
          <Field label="Nombre de la empresa">
            <input className="input" value={form.companyName} onChange={(e) => { setForm({ ...form, companyName: e.target.value }); setSaved(false); }} />
          </Field>
          <label className="flex items-start gap-3">
            <input type="checkbox" className="mt-1 h-4 w-4" checked={form.autoDeductInventory} onChange={(e) => { setForm({ ...form, autoDeductInventory: e.target.checked }); setSaved(false); }} />
            <span className="text-sm">
              <span className="font-medium">Descontar inventario automáticamente</span>
              <br />
              <span className="text-slate-500">Cada llenado descuenta del inventario general la cantidad realmente llenada.</span>
            </span>
          </label>
          <label className="flex items-start gap-3">
            <input type="checkbox" className="mt-1 h-4 w-4" checked={form.requirePhotoOnComplete} onChange={(e) => { setForm({ ...form, requirePhotoOnComplete: e.target.checked }); setSaved(false); }} />
            <span className="text-sm">
              <span className="font-medium">Exigir fotografía para completar tareas</span>
            </span>
          </label>
          <Field label="Avisar tareas próximas a vencer (horas antes)">
            <input className="input" type="number" min={1} max={720} value={form.dueSoonHours} onChange={(e) => { setForm({ ...form, dueSoonHours: e.target.value }); setSaved(false); }} />
          </Field>
          <ErrorBox error={save.error} />
          <div className="flex items-center gap-3">
            <Button onClick={() => save.mutate()} loading={save.isPending}>Guardar cambios</Button>
            {saved && <span className="text-sm text-emerald-700">Guardado</span>}
          </div>
        </div>
      </Card>
      <Card title="Logo de la empresa">
        <p className="mb-3 text-sm text-slate-500">Se muestra en el menú, en el inicio de sesión y en los informes PDF.</p>
        <div className="flex items-center gap-4">
          <div className="flex h-24 w-24 items-center justify-center overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
            {data?.hasLogo ? <img src={`/api/public/logo?v=${logo.submittedAt}`} alt="Logo" className="h-full w-full object-contain" /> : <span className="text-xs text-slate-400">Sin logo</span>}
          </div>
          <label className="btn-secondary cursor-pointer">
            <Upload className="h-4 w-4" /> {logo.isPending ? 'Subiendo…' : 'Subir logo'}
            <input type="file" accept="image/png,image/jpeg" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) logo.mutate(f); e.target.value = ''; }} />
          </label>
        </div>
        <div className="mt-3"><ErrorBox error={logo.error} /></div>
      </Card>
    </div>
  );
}

function AuditLog() {
  const { filters, set, reset, page, setPage } = useFilters({ action: '', userId: '', from: '', to: '' });
  const { data, isLoading, error } = useQuery({ queryKey: ['audit', filters, page], queryFn: () => api.get<Paged<AuditItem>>('/settings/audit', { ...filters, page }) });
  return (
    <>
      <FilterBar onReset={reset}>
        <SelectFilter value={filters.action} onChange={(action) => set({ action })} all="Todas las acciones" options={Object.entries(ACTION_LABELS).map(([value, label]) => ({ value, label }))} />
        <UserFilter value={filters.userId} onChange={(userId) => set({ userId })} />
        <DateInput title="Desde" value={filters.from} onChange={(from) => set({ from })} />
        <DateInput title="Hasta" value={filters.to} onChange={(to) => set({ to })} />
      </FilterBar>
      <ErrorBox error={error} />
      <Card bodyClass="">
        {isLoading ? (
          <Loading />
        ) : (
          <>
            <Table empty={!data?.items.length} head={<tr><th className="th">Fecha</th><th className="th">Usuario</th><th className="th">Acción</th><th className="th hidden md:table-cell">Registro</th><th className="th hidden lg:table-cell">Detalle</th></tr>}>
              {data?.items.map((a) => (
                <tr key={a.id}>
                  <td className="td whitespace-nowrap">{fmtDateTime(a.createdAt)}</td>
                  <td className="td">{a.user?.name ?? '—'}</td>
                  <td className="td">{ACTION_LABELS[a.action] ?? a.action}</td>
                  <td className="td hidden md:table-cell">{a.entity}{a.entityId ? ` #${a.entityId}` : ''}</td>
                  <td className="td hidden max-w-md truncate font-mono text-xs text-slate-500 lg:table-cell" title={a.details ? JSON.stringify(a.details) : ''}>{a.details ? JSON.stringify(a.details) : ''}</td>
                </tr>
              ))}
            </Table>
            {data && <Pagination page={page} pageSize={data.pageSize} total={data.total} onChange={setPage} />}
          </>
        )}
      </Card>
    </>
  );
}

export default function SettingsPage() {
  const [tab, setTab] = useState<'general' | 'audit'>('general');
  return (
    <>
      <PageHeader title="Configuración" subtitle="Parámetros de la empresa y auditoría de acciones" />
      <Tabs value={tab} onChange={setTab} tabs={[{ value: 'general', label: 'General' }, { value: 'audit', label: 'Auditoría' }]} />
      {tab === 'general' ? <GeneralSettings /> : <AuditLog />}
    </>
  );
}
