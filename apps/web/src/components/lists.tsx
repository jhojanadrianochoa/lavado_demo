import { Link } from 'react-router-dom';
import { AlertTriangle, Boxes, Camera, ClipboardList, Droplets, ListChecks } from 'lucide-react';
import { photoUrl } from '../lib/api';
import { fmtDate, fmtDateTime, fmtQty, label } from '../lib/format';
import type { Filling, HistoryEntry, Incident, Task } from '../lib/types';
import { Badge, Empty, Table } from './ui';

export function TaskTable({ items, showPoint = true }: { items: Task[]; showPoint?: boolean }) {
  return (
    <Table
      empty={!items.length}
      head={
        <tr>
          <th className="th">#</th>
          <th className="th">Descripción</th>
          {showPoint && <th className="th hidden md:table-cell">Punto</th>}
          <th className="th hidden sm:table-cell">Responsable</th>
          <th className="th hidden lg:table-cell">Prioridad</th>
          <th className="th hidden lg:table-cell">Fecha límite</th>
          <th className="th">Estado</th>
        </tr>
      }
    >
      {items.map((t) => {
        const overdue = t.dueDate && new Date(t.dueDate) < new Date() && !['COMPLETADA', 'CANCELADA'].includes(t.status);
        return (
          <tr key={t.id} className="hover:bg-slate-50">
            <td className="td font-mono text-xs text-slate-500">{t.id}</td>
            <td className="td">
              <Link to={`/tareas/${t.id}`} className="font-medium text-brand-700 hover:underline">
                {t.description}
              </Link>
              <div className="mt-0.5 text-xs text-slate-500">
                {label(t.type)}
                {t.product ? ` · ${t.product.name}` : ''}
                <span className="md:hidden"> · {t.point.name}</span>
              </div>
            </td>
            {showPoint && <td className="td hidden md:table-cell">{t.point.name}</td>}
            <td className="td hidden sm:table-cell">{t.assignee?.name ?? <span className="text-slate-400">Sin asignar</span>}</td>
            <td className="td hidden lg:table-cell">
              <Badge value={t.priority} />
            </td>
            <td className={`td hidden lg:table-cell ${overdue ? 'font-semibold text-red-600' : ''}`}>{t.dueDate ? fmtDateTime(t.dueDate) : '—'}</td>
            <td className="td">
              <Badge value={t.status} />
            </td>
          </tr>
        );
      })}
    </Table>
  );
}

export function FillingTable({ items, showPoint = true }: { items: Filling[]; showPoint?: boolean }) {
  return (
    <Table
      empty={!items.length}
      head={
        <tr>
          <th className="th">Fecha y hora</th>
          {showPoint && <th className="th">Punto</th>}
          <th className="th">Producto</th>
          <th className="th text-right">Cantidad llenada</th>
          <th className="th hidden sm:table-cell">Realizado por</th>
          <th className="th hidden md:table-cell">Tarea</th>
          <th className="th hidden lg:table-cell">Observación</th>
          <th className="th hidden lg:table-cell">Fotos</th>
        </tr>
      }
    >
      {items.map((f) => (
        <tr key={f.id} className="hover:bg-slate-50">
          <td className="td whitespace-nowrap">{fmtDateTime(f.filledAt)}</td>
          {showPoint && <td className="td">{f.point.name}</td>}
          <td className="td">{f.product.name}</td>
          <td className="td whitespace-nowrap text-right font-semibold">{fmtQty(f.quantity, f.unit)}</td>
          <td className="td hidden sm:table-cell">{f.user.name}</td>
          <td className="td hidden md:table-cell">
            {f.task ? (
              <Link className="text-brand-700 hover:underline" to={`/tareas/${f.task.id}`}>
                #{f.task.id}
              </Link>
            ) : (
              '—'
            )}
          </td>
          <td className="td hidden max-w-xs lg:table-cell">{f.notes ?? '—'}</td>
          <td className="td hidden lg:table-cell">
            <div className="flex gap-1">
              {f.photos.slice(0, 3).map((p) => (
                <a key={p.id} href={photoUrl(p.id)} target="_blank" rel="noreferrer">
                  <img src={photoUrl(p.id)} alt="" className="h-8 w-8 rounded object-cover" />
                </a>
              ))}
            </div>
          </td>
        </tr>
      ))}
    </Table>
  );
}

export function IncidentTable({ items, showPoint = true }: { items: Incident[]; showPoint?: boolean }) {
  return (
    <Table
      empty={!items.length}
      head={
        <tr>
          <th className="th">#</th>
          <th className="th">Tipo / descripción</th>
          {showPoint && <th className="th hidden md:table-cell">Punto</th>}
          <th className="th hidden sm:table-cell">Reportó</th>
          <th className="th hidden lg:table-cell">Responsable</th>
          <th className="th hidden lg:table-cell">Prioridad</th>
          <th className="th hidden md:table-cell">Fecha</th>
          <th className="th">Estado</th>
        </tr>
      }
    >
      {items.map((i) => (
        <tr key={i.id} className="hover:bg-slate-50">
          <td className="td font-mono text-xs text-slate-500">{i.id}</td>
          <td className="td">
            <Link to={`/incidencias/${i.id}`} className="font-medium text-brand-700 hover:underline">
              {label(i.type)}
            </Link>
            <p className="line-clamp-2 text-xs text-slate-500">{i.description}</p>
          </td>
          {showPoint && <td className="td hidden md:table-cell">{i.point.name}</td>}
          <td className="td hidden sm:table-cell">{i.reportedBy.name}</td>
          <td className="td hidden lg:table-cell">{i.assignee?.name ?? '—'}</td>
          <td className="td hidden lg:table-cell">
            <Badge value={i.priority} />
          </td>
          <td className="td hidden whitespace-nowrap md:table-cell">{fmtDate(i.createdAt)}</td>
          <td className="td">
            <Badge value={i.status} />
          </td>
        </tr>
      ))}
    </Table>
  );
}

const KIND_ICON = { TAREA: ListChecks, REQUERIMIENTO: ClipboardList, LLENADO: Droplets, INCIDENCIA: AlertTriangle, INVENTARIO: Boxes, FOTO: Camera };
const KIND_COLOR = {
  TAREA: 'bg-indigo-100 text-indigo-700',
  REQUERIMIENTO: 'bg-amber-100 text-amber-700',
  LLENADO: 'bg-brand-100 text-brand-700',
  INCIDENCIA: 'bg-red-100 text-red-700',
  INVENTARIO: 'bg-violet-100 text-violet-700',
  FOTO: 'bg-slate-100 text-slate-700',
};

export function HistoryList({ items }: { items: HistoryEntry[] }) {
  if (!items.length) return <Empty text="Sin registros en el historial" />;
  return (
    <ol className="divide-y divide-slate-100">
      {items.map((e) => {
        const Icon = KIND_ICON[e.kind];
        const body = (
          <div className="flex gap-3 px-4 py-3 hover:bg-slate-50">
            <span className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${KIND_COLOR[e.kind]}`}>
              <Icon className="h-4 w-4" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium text-slate-800">{e.title}</span>
                {e.status && <Badge value={e.status} />}
                {e.quantity !== undefined && e.unit && <span className="rounded bg-brand-50 px-2 py-0.5 text-xs font-semibold text-brand-800">{fmtQty(e.quantity, e.unit)}</span>}
              </div>
              <p className="text-sm text-slate-600">{e.detail}</p>
              <p className="mt-0.5 text-xs text-slate-400">
                {fmtDateTime(e.date)}
                {e.point ? ` · ${e.point.name}` : ''}
                {e.user ? ` · ${e.user.name}` : ''}
              </p>
            </div>
            {e.photoId && <img src={photoUrl(e.photoId)} alt="" className="h-14 w-14 shrink-0 rounded-lg object-cover" loading="lazy" />}
          </div>
        );
        return <li key={`${e.kind}-${e.id}`}>{e.link ? <Link to={e.link}>{body}</Link> : body}</li>;
      })}
    </ol>
  );
}
