import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Pencil, Plus } from 'lucide-react';
import { api } from '../lib/api';
import { fmtDate, fmtQty } from '../lib/format';
import type { Paged, Product } from '../lib/types';
import { useCatalogs, useDebounced, useFilters } from '../components/hooks';
import { FilterBar, SearchInput, SelectFilter } from '../components/Filters';
import { ActiveBadge, Button, Card, ErrorBox, Field, Loading, Modal, PageHeader, Pagination, Table } from '../components/ui';

function ProductForm({ product, onClose }: { product: Product | null; onClose: () => void }) {
  const qc = useQueryClient();
  const { data: catalogs } = useCatalogs();
  const [form, setForm] = useState({
    name: product?.name ?? '',
    description: product?.description ?? '',
    unit: product?.unit ?? 'L',
    minStock: String(product?.minStock ?? 0),
    initialStock: '0',
    active: product?.active ?? true,
  });
  const save = useMutation({
    mutationFn: () => {
      const body = { name: form.name, description: form.description, unit: form.unit, minStock: Number(form.minStock), active: form.active };
      return product ? api.put(`/products/${product.id}`, body) : api.post('/products', { ...body, initialStock: Number(form.initialStock) });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['products'] });
      onClose();
    },
  });
  const submit = (e: FormEvent) => {
    e.preventDefault();
    save.mutate();
  };
  return (
    <Modal
      open
      onClose={onClose}
      title={product ? `Editar ${product.name}` : 'Nuevo producto'}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button type="submit" form="product-form" loading={save.isPending}>Guardar</Button>
        </>
      }
    >
      <form id="product-form" onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
        <Field label="Nombre *" className="sm:col-span-2">
          <input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
        </Field>
        <Field label="Descripción" className="sm:col-span-2">
          <textarea className="input" rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
        </Field>
        <Field label="Unidad de medida *">
          <select className="input" value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })}>
            {(catalogs?.units ?? ['L']).map((u) => (
              <option key={u} value={u}>{u === 'L' ? 'Litros (L)' : u}</option>
            ))}
          </select>
        </Field>
        <Field label="Stock mínimo" hint="Se genera alerta al llegar a este valor">
          <input className="input" type="number" min={0} step="any" value={form.minStock} onChange={(e) => setForm({ ...form, minStock: e.target.value })} />
        </Field>
        {!product && (
          <Field label="Inventario inicial" hint="Se registra como entrada de inventario">
            <input className="input" type="number" min={0} step="any" value={form.initialStock} onChange={(e) => setForm({ ...form, initialStock: e.target.value })} />
          </Field>
        )}
        <Field label="Estado">
          <select className="input" value={form.active ? '1' : '0'} onChange={(e) => setForm({ ...form, active: e.target.value === '1' })}>
            <option value="1">Activo</option>
            <option value="0">Inactivo</option>
          </select>
        </Field>
        {product && <p className="text-xs text-slate-500 sm:col-span-2">El stock actual se modifica desde Inventario mediante entradas, salidas o ajustes.</p>}
        <div className="sm:col-span-2"><ErrorBox error={save.error} /></div>
      </form>
    </Modal>
  );
}

export default function Products() {
  const { filters, set, reset, page, setPage } = useFilters({ q: '', active: '', lowStock: '' });
  const q = useDebounced(filters.q);
  const [editing, setEditing] = useState<Product | 'new' | null>(null);
  const { data, isLoading, error } = useQuery({ queryKey: ['products', { ...filters, q, page }], queryFn: () => api.get<Paged<Product>>('/products', { ...filters, q, page }) });
  return (
    <>
      <PageHeader title="Productos" subtitle="Catálogo de productos y unidades de medida" actions={<Button onClick={() => setEditing('new')}><Plus className="h-4 w-4" /> Nuevo producto</Button>} />
      <FilterBar onReset={reset}>
        <SearchInput value={filters.q} onChange={(v) => set({ q: v })} placeholder="Buscar producto" />
        <SelectFilter value={filters.active} onChange={(active) => set({ active })} all="Todos los estados" options={[{ value: 'true', label: 'Activos' }, { value: 'false', label: 'Inactivos' }]} />
        <SelectFilter value={filters.lowStock} onChange={(lowStock) => set({ lowStock })} all="Todo el stock" options={[{ value: 'true', label: 'Solo stock bajo' }]} />
      </FilterBar>
      <ErrorBox error={error} />
      <Card bodyClass="">
        {isLoading ? (
          <Loading />
        ) : (
          <>
            <Table
              empty={!data?.items.length}
              head={
                <tr>
                  <th className="th">Producto</th>
                  <th className="th">Unidad</th>
                  <th className="th text-right">Stock actual</th>
                  <th className="th hidden sm:table-cell text-right">Stock mínimo</th>
                  <th className="th hidden md:table-cell">Creado</th>
                  <th className="th">Estado</th>
                  <th className="th" />
                </tr>
              }
            >
              {data?.items.map((p) => {
                const low = p.currentStock <= p.minStock;
                return (
                  <tr key={p.id} className="hover:bg-slate-50">
                    <td className="td">
                      <p className="font-medium">{p.name}</p>
                      <p className="text-xs text-slate-500">{p.description}</p>
                    </td>
                    <td className="td">{p.unit}</td>
                    <td className={`td whitespace-nowrap text-right font-semibold ${low ? 'text-red-600' : ''}`}>
                      {low && <AlertTriangle className="mr-1 inline h-4 w-4" />}
                      {fmtQty(p.currentStock, p.unit)}
                    </td>
                    <td className="td hidden whitespace-nowrap text-right sm:table-cell">{fmtQty(p.minStock, p.unit)}</td>
                    <td className="td hidden md:table-cell">{fmtDate(p.createdAt)}</td>
                    <td className="td"><ActiveBadge active={p.active} /></td>
                    <td className="td text-right">
                      <button className="btn-ghost" onClick={() => setEditing(p)} aria-label="Editar"><Pencil className="h-4 w-4" /></button>
                    </td>
                  </tr>
                );
              })}
            </Table>
            {data && <Pagination page={page} pageSize={data.pageSize} total={data.total} onChange={setPage} />}
          </>
        )}
      </Card>
      {editing && <ProductForm product={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
    </>
  );
}
