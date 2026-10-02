import type { ReactNode } from 'react';
import { Search, X } from 'lucide-react';
import { label } from '../lib/format';
import { usePointOptions, useProductOptions, useUserOptions } from './hooks';

export function FilterBar({ children, onReset }: { children: ReactNode; onReset?: () => void }) {
  return (
    <div className="card mb-4 p-3">
      <div className="grid grid-cols-2 gap-2 md:grid-cols-3 lg:grid-cols-6">
        {children}
        {onReset && (
          <button type="button" onClick={onReset} className="btn-ghost justify-start text-xs">
            <X className="h-4 w-4" /> Limpiar filtros
          </button>
        )}
      </div>
    </div>
  );
}

export function SearchInput({ value, onChange, placeholder = 'Buscar…', className }: { value: string; onChange: (v: string) => void; placeholder?: string; className?: string }) {
  return (
    <div className={`relative col-span-2 ${className ?? ''}`}>
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
      <input className="input pl-9" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} aria-label="Búsqueda rápida" />
    </div>
  );
}

export function DateInput({ value, onChange, title }: { value: string; onChange: (v: string) => void; title: string }) {
  return <input type="date" className="input" value={value} onChange={(e) => onChange(e.target.value)} title={title} aria-label={title} />;
}

export function SelectFilter({ value, onChange, options, all, title }: { value: string; onChange: (v: string) => void; options: (string | { value: string | number; label: string })[]; all: string; title?: string }) {
  return (
    <select className="input" value={value} onChange={(e) => onChange(e.target.value)} aria-label={title ?? all}>
      <option value="">{all}</option>
      {options.map((o) =>
        typeof o === 'string' ? (
          <option key={o} value={o}>
            {label(o)}
          </option>
        ) : (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ),
      )}
    </select>
  );
}

export function PointFilter({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const { data = [] } = usePointOptions();
  return <SelectFilter value={value} onChange={onChange} all="Todos los puntos" options={data.map((p) => ({ value: p.id, label: p.name }))} />;
}

export function ProductFilter({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const { data = [] } = useProductOptions(false);
  return <SelectFilter value={value} onChange={onChange} all="Todos los productos" options={data.map((p) => ({ value: p.id, label: p.name }))} />;
}

export function UserFilter({ value, onChange, role }: { value: string; onChange: (v: string) => void; role?: string }) {
  const { data = [] } = useUserOptions(role ? { role } : {});
  return <SelectFilter value={value} onChange={onChange} all="Todos los usuarios" options={data.map((u) => ({ value: u.id, label: u.name }))} />;
}
