import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, ArrowDownCircle, ArrowUpCircle, Scale } from 'lucide-react';
import { api } from '../lib/api';
import { fmtDateTime, fmtNum, fmtQty } from '../lib/format';
import type { Movement, MovementType, Paged, Product } from '../lib/types';
import { useAuth } from '../auth/AuthContext';
import { useFilters, usePointOptions, useProductOptions } from '../components/hooks';
import { DateInput, FilterBar, PointFilter, ProductFilter, SelectFilter } from '../components/Filters';
import { Badge, Button, Card, ErrorBox, Field, Loading, Modal, PageHeader, Pagination, Table } from '../components/ui';

function MovementForm({ type, onClose }: { type: Exclude<MovementType, 'LLENADO'>; onClose: () => void }) {
  const qc = useQueryClient();
  const { data: products = [] } = useProductOptions(false);
  const { data: points = [] } = usePointOptions();
  const [form, setForm] = useState({ productId: '', quantity: '', reason: '', pointId: '' });
  const product = products.find((p) => p.id === Number(form.productId));
  const save = useMutation({
    mutationFn: () => api.post('/inventory/movements', { ...form, type, quantity: Number(form.quantity) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['inventory'] });
      qc.invalidateQueries({ queryKey: ['products'] });
      onClose();
    },
  });
  const titles = { ENTRADA: 'Registrar entrada', SALIDA: 'Registrar salida', AJUSTE: 'Ajuste de inventario' };
  const submit = (e: FormEvent) => {
    e.preventDefault();
    save.mutate();
  };
  return (
    <Modal
      open
      onClose={onClose}
      title={titles[type]}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button type="submit" form="mov-form" loading={save.isPending}>Guardar</Button>
        </>
      }
    >
      <form id="mov-form" onSubmit={submit} className="space-y-4">
        <Field label="Producto *">
          <select className="input" value={form.productId} onChange={(e) => setForm({ ...form, productId: e.target.value })} required>
            <option value="">Seleccione…</option>
            {products.map((p) => (
              <option key={p.id} value={p.id}>{p.name} (stock {fmtQty(p.currentStock, p.unit)})</option>
            ))}
          </select>
        </Field>
        <Field label={type === 'AJUSTE' ? 'Nuevo stock contado *' : 'Cantidad *'} hint={type === 'AJUSTE' ? 'Ingrese el stock físico real; el sistema calcula la diferencia' : undefined}>
          <div className="flex items-center gap-2">
            <input className="input" type="number" min={0} step="any" inputMode="decimal" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} required />
            <span className="text-sm text-slate-500">{product?.unit ?? ''}</span>
          </div>
        </Field>
        <Field label="Motivo *">
          <input className="input" value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} required placeholder={type === 'ENTRADA' ? 'Compra a proveedor' : type === 'SALIDA' ? 'Producto vencido' : 'Conteo físico'} />
        </Field>
        <Field label="Punto relacionado (opcional)">
          <select className="input" value={form.pointId} onChange={(e) => setForm({ ...form, pointId: e.target.value })}>
            <option value="">Ninguno</option>
            {points.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </Field>
        <ErrorBox error={save.error} />
      </form>
    </Modal>
  );
}

export default function Inventory() {
  const { hasRole } = useAuth();
  const admin = hasRole('ADMIN');
  const [modal, setModal] = useState<Exclude<MovementType, 'LLENADO'> | null>(null);
  const { filters, set, reset, page, setPage } = useFilters({ productId: '', type: '', pointId: '', from: '', to: '' });
  const stock = useQuery({ queryKey: ['products', 'stock'], queryFn: () => api.get<Paged<Product>>('/products', { pageSize: 500 }) });
  const movements = useQuery({ queryKey: ['inventory', filters, page], queryFn: () => api.get<Paged<Movement>>('/inventory/movements', { ...filters, page }) });

  return (
    <>
      <PageHeader
        title="Inventario"
        subtitle="Stock general de productos y movimientos"
        actions={
          admin && (
            <>
              <Button onClick={() => setModal('ENTRADA')}><ArrowDownCircle className="h-4 w-4" /> Entrada</Button>
              <Button variant="secondary" onClick={() => setModal('SALIDA')}><ArrowUpCircle className="h-4 w-4" /> Salida</Button>
              <Button variant="secondary" onClick={() => setModal('AJUSTE')}><Scale className="h-4 w-4" /> Ajuste</Button>
            </>
          )
        }
      />
      <div className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {stock.data?.items.map((p) => {
          const low = p.currentStock <= p.minStock;
          const pct = p.minStock > 0 ? Math.min(100, (p.currentStock / (p.minStock * 4)) * 100) : 100;
          return (
            <div key={p.id} className={`card p-4 ${low ? 'border-red-300 bg-red-50' : ''}`}>
              <div className="flex items-center justify-between">
                <p className="font-semibold">{p.name}</p>
                {low && <span className="flex items-center gap-1 text-xs font-semibold text-red-700"><AlertTriangle className="h-4 w-4" /> Stock bajo</span>}
              </div>
              <p className="mt-1 text-2xl font-bold">{fmtQty(p.currentStock, p.unit)}</p>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-200">
                <div className={`h-full ${low ? 'bg-red-500' : 'bg-brand-600'}`} style={{ width: `${pct}%` }} />
              </div>
              <p className="mt-1 text-xs text-slate-500">Mínimo: {fmtNum(p.minStock)} {p.unit}</p>
            </div>
          );
        })}
      </div>
      <h2 className="mb-2 font-semibold">Movimientos</h2>
      <FilterBar onReset={reset}>
        <ProductFilter value={filters.productId} onChange={(productId) => set({ productId })} />
        <SelectFilter value={filters.type} onChange={(type) => set({ type })} all="Todos los tipos" options={['ENTRADA', 'SALIDA', 'AJUSTE', 'LLENADO']} />
        <PointFilter value={filters.pointId} onChange={(pointId) => set({ pointId })} />
        <DateInput title="Desde" value={filters.from} onChange={(from) => set({ from })} />
        <DateInput title="Hasta" value={filters.to} onChange={(to) => set({ to })} />
      </FilterBar>
      <ErrorBox error={movements.error} />
      <Card bodyClass="">
        {movements.isLoading ? (
          <Loading />
        ) : (
          <>
            <Table
              empty={!movements.data?.items.length}
              head={
                <tr>
                  <th className="th">Fecha</th>
                  <th className="th">Producto</th>
                  <th className="th">Tipo</th>
                  <th className="th text-right">Cantidad</th>
                  <th className="th hidden sm:table-cell text-right">Saldo</th>
                  <th className="th hidden md:table-cell">Usuario</th>
                  <th className="th hidden lg:table-cell">Punto</th>
                  <th className="th hidden lg:table-cell">Motivo</th>
                </tr>
              }
            >
              {movements.data?.items.map((m) => (
                <tr key={m.id}>
                  <td className="td whitespace-nowrap">{fmtDateTime(m.createdAt)}</td>
                  <td className="td">{m.product.name}</td>
                  <td className="td"><Badge value={m.type} /></td>
                  <td className={`td whitespace-nowrap text-right font-semibold ${m.quantity < 0 ? 'text-orange-700' : 'text-emerald-700'}`}>
                    {m.quantity > 0 ? '+' : ''}
                    {fmtQty(m.quantity, m.product.unit)}
                  </td>
                  <td className="td hidden whitespace-nowrap text-right sm:table-cell">{fmtQty(m.balanceAfter, m.product.unit)}</td>
                  <td className="td hidden md:table-cell">{m.user.name}</td>
                  <td className="td hidden lg:table-cell">{m.point?.name ?? '—'}</td>
                  <td className="td hidden lg:table-cell">{m.reason ?? '—'}</td>
                </tr>
              ))}
            </Table>
            {movements.data && <Pagination page={page} pageSize={movements.data.pageSize} total={movements.data.total} onChange={setPage} />}
          </>
        )}
      </Card>
      {modal && <MovementForm type={modal} onClose={() => setModal(null)} />}
    </>
  );
}
