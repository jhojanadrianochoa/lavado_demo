import { useEffect, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import clsx from 'clsx';
import { ChevronLeft, ChevronRight, Inbox, Loader2, X } from 'lucide-react';
import { STATUS_COLORS, label } from '../lib/format';

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={clsx('animate-spin', className ?? 'h-5 w-5')} />;
}

export function Loading({ text = 'Cargando…' }: { text?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-12 text-slate-500">
      <Spinner /> {text}
    </div>
  );
}

export function ErrorBox({ error }: { error: unknown }) {
  if (!error) return null;
  return <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error instanceof Error ? error.message : String(error)}</div>;
}

export function Button({ loading, children, className, variant = 'primary', ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { loading?: boolean; variant?: 'primary' | 'secondary' | 'danger' | 'ghost' }) {
  return (
    <button {...rest} disabled={rest.disabled || loading} className={clsx(`btn-${variant}`, className)}>
      {loading && <Spinner className="h-4 w-4" />}
      {children}
    </button>
  );
}

export function PageHeader({ title, subtitle, actions, back }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode; back?: string }) {
  return (
    <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        {back && (
          <Link to={back} className="mb-1 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-brand-700">
            <ChevronLeft className="h-4 w-4" /> Volver
          </Link>
        )}
        <h1 className="truncate text-xl font-bold text-slate-900 sm:text-2xl">{title}</h1>
        {subtitle && <p className="mt-0.5 text-sm text-slate-500">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function Card({ title, actions, children, className, bodyClass }: { title?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string; bodyClass?: string }) {
  return (
    <section className={clsx('card', className)}>
      {(title || actions) && (
        <header className="flex items-center justify-between gap-2 border-b border-slate-100 px-4 py-3">
          <h2 className="font-semibold text-slate-800">{title}</h2>
          {actions}
        </header>
      )}
      <div className={bodyClass ?? 'p-4'}>{children}</div>
    </section>
  );
}

export function Badge({ value, text, className }: { value: string; text?: string; className?: string }) {
  return <span className={clsx('inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium', STATUS_COLORS[value] ?? 'bg-slate-100 text-slate-700', className)}>{text ?? label(value)}</span>;
}

export function ActiveBadge({ active }: { active: boolean }) {
  return <span className={clsx('inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium', active ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-600')}>{active ? 'Activo' : 'Inactivo'}</span>;
}

export function Field({ label: text, error, children, hint, className }: { label: string; error?: string; children: ReactNode; hint?: string; className?: string }) {
  return (
    <label className={clsx('block', className)}>
      <span className="label">{text}</span>
      {children}
      {hint && !error && <span className="mt-1 block text-xs text-slate-500">{hint}</span>}
      {error && <span className="mt-1 block text-xs text-red-600">{error}</span>}
    </label>
  );
}

export function Modal({ open, onClose, title, children, footer, size = 'md' }: { open: boolean; onClose: () => void; title: string; children: ReactNode; footer?: ReactNode; size?: 'md' | 'lg' }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/50 sm:items-center sm:p-4" onMouseDown={onClose}>
      <div className={clsx('flex max-h-[92vh] w-full flex-col rounded-t-2xl bg-white shadow-xl sm:rounded-2xl', size === 'lg' ? 'sm:max-w-3xl' : 'sm:max-w-lg')} onMouseDown={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label={title}>
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <h3 className="text-lg font-semibold">{title}</h3>
          <button type="button" className="btn-ghost" onClick={onClose} aria-label="Cerrar">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="flex justify-end gap-2 border-t border-slate-100 px-5 py-3">{footer}</div>}
      </div>
    </div>
  );
}

export function Empty({ text = 'No hay registros para mostrar', icon }: { text?: string; icon?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-12 text-center text-sm text-slate-500">
      {icon ?? <Inbox className="h-8 w-8 text-slate-300" />}
      {text}
    </div>
  );
}

export function Pagination({ page, pageSize, total, onChange }: { page: number; pageSize: number; total: number; onChange: (p: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (total <= pageSize) return total ? <p className="px-4 py-3 text-xs text-slate-500">{total} registro(s)</p> : null;
  return (
    <div className="flex items-center justify-between gap-2 border-t border-slate-100 px-4 py-3 text-sm">
      <span className="text-slate-500">
        {total} registros · página {page} de {pages}
      </span>
      <div className="flex gap-1">
        <button className="btn-secondary px-2 py-1.5" disabled={page <= 1} onClick={() => onChange(page - 1)} aria-label="Anterior">
          <ChevronLeft className="h-4 w-4" />
        </button>
        <button className="btn-secondary px-2 py-1.5" disabled={page >= pages} onClick={() => onChange(page + 1)} aria-label="Siguiente">
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

export function Kpi({ label: text, value, icon, tone = 'brand', to }: { label: string; value: ReactNode; icon?: ReactNode; tone?: 'brand' | 'amber' | 'indigo' | 'emerald' | 'red' | 'slate'; to?: string }) {
  const tones = {
    brand: 'bg-brand-50 text-brand-700',
    amber: 'bg-amber-50 text-amber-700',
    indigo: 'bg-indigo-50 text-indigo-700',
    emerald: 'bg-emerald-50 text-emerald-700',
    red: 'bg-red-50 text-red-700',
    slate: 'bg-slate-100 text-slate-700',
  };
  const body = (
    <div className="card flex items-center gap-3 p-4 transition hover:shadow-md">
      {icon && <div className={clsx('rounded-lg p-2.5', tones[tone])}>{icon}</div>}
      <div className="min-w-0">
        <p className="truncate text-xs font-medium uppercase tracking-wide text-slate-500">{text}</p>
        <p className="text-2xl font-bold text-slate-900">{value}</p>
      </div>
    </div>
  );
  return to ? <Link to={to}>{body}</Link> : body;
}

export function InfoRow({ label: text, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 py-2 sm:flex-row sm:gap-4">
      <dt className="w-44 shrink-0 text-sm text-slate-500">{text}</dt>
      <dd className="text-sm font-medium text-slate-800">{children || '—'}</dd>
    </div>
  );
}

export function Tabs<T extends string>({ tabs, value, onChange }: { tabs: { value: T; label: string; count?: number }[]; value: T; onChange: (v: T) => void }) {
  return (
    <div className="mb-4 flex gap-1 overflow-x-auto border-b border-slate-200">
      {tabs.map((t) => (
        <button
          key={t.value}
          type="button"
          onClick={() => onChange(t.value)}
          className={clsx('whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium', value === t.value ? 'border-brand-700 text-brand-700' : 'border-transparent text-slate-500 hover:text-slate-800')}
        >
          {t.label}
          {t.count !== undefined && <span className="ml-1.5 rounded-full bg-slate-100 px-1.5 text-xs text-slate-600">{t.count}</span>}
        </button>
      ))}
    </div>
  );
}

export function Table({ head, children, empty }: { head: ReactNode; children: ReactNode; empty?: boolean }) {
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-slate-100">
        <thead className="bg-slate-50">{head}</thead>
        <tbody className="divide-y divide-slate-100">{children}</tbody>
      </table>
      {empty && <Empty />}
    </div>
  );
}
