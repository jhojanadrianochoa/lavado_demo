import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import {
  AlertTriangle,
  BarChart3,
  Bell,
  Boxes,
  ClipboardList,
  Droplets,
  FileText,
  History,
  Home,
  KeyRound,
  LayoutDashboard,
  ListChecks,
  LogOut,
  MapPin,
  Menu,
  Package,
  Settings,
  Users,
  X,
  type LucideIcon,
} from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { api } from '../lib/api';
import { fmtDateTime, label } from '../lib/format';
import type { NotificationItem, Role } from '../lib/types';

interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  roles: Role[];
  end?: boolean;
}

const NAV: NavItem[] = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, roles: ['ADMIN', 'SUPERVISOR'], end: true },
  { to: '/', label: 'Inicio', icon: Home, roles: ['WORKER'], end: true },
  { to: '/puntos', label: 'Puntos de lavado', icon: MapPin, roles: ['ADMIN', 'SUPERVISOR'] },
  { to: '/tareas', label: 'Tareas', icon: ListChecks, roles: ['ADMIN', 'SUPERVISOR'] },
  { to: '/tareas', label: 'Mis tareas', icon: ListChecks, roles: ['WORKER'] },
  { to: '/llenados/nuevo', label: 'Registrar llenado', icon: Droplets, roles: ['WORKER'] },
  { to: '/incidencias/nueva', label: 'Reportar incidencia', icon: AlertTriangle, roles: ['WORKER'] },
  { to: '/requerimientos', label: 'Requerimientos', icon: ClipboardList, roles: ['ADMIN', 'SUPERVISOR'] },
  { to: '/llenados', label: 'Llenados', icon: Droplets, roles: ['ADMIN', 'SUPERVISOR'], end: true },
  { to: '/productos', label: 'Productos', icon: Package, roles: ['ADMIN'] },
  { to: '/inventario', label: 'Inventario', icon: Boxes, roles: ['ADMIN', 'SUPERVISOR'] },
  { to: '/incidencias', label: 'Incidencias', icon: AlertTriangle, roles: ['ADMIN', 'SUPERVISOR'], end: true },
  { to: '/usuarios', label: 'Usuarios', icon: Users, roles: ['ADMIN'] },
  { to: '/informes', label: 'Informes', icon: BarChart3, roles: ['ADMIN', 'SUPERVISOR'] },
  { to: '/historial', label: 'Historial', icon: History, roles: ['ADMIN', 'SUPERVISOR', 'WORKER'] },
  { to: '/configuracion', label: 'Configuración', icon: Settings, roles: ['ADMIN'] },
];

const WORKER_TABS = ['/', '/tareas', '/llenados/nuevo', '/incidencias/nueva', '/historial'];

function Brand() {
  const { data } = useQuery({ queryKey: ['branding'], queryFn: () => api.get<{ companyName: string; hasLogo: boolean }>('/public/branding'), staleTime: 60_000 });
  return (
    <Link to="/" className="flex items-center gap-2">
      {data?.hasLogo ? (
        <img src="/api/public/logo" alt="" className="h-9 w-9 rounded-lg object-contain" />
      ) : (
        <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-700 text-white">
          <Droplets className="h-5 w-5" />
        </span>
      )}
      <span className="truncate text-lg font-bold text-slate-900">{data?.companyName ?? 'LavaControl'}</span>
    </Link>
  );
}

function Notifications() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { data } = useQuery({
    queryKey: ['notifications'],
    queryFn: () => api.get<{ items: NotificationItem[]; unreadCount: number }>('/notifications', { limit: 20 }),
    refetchInterval: 60_000,
  });
  const readAll = useMutation({ mutationFn: () => api.post('/notifications/read-all'), onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }) });
  useEffect(() => {
    const onClick = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);
  const openItem = async (n: NotificationItem) => {
    setOpen(false);
    if (!n.readAt) await api.post(`/notifications/${n.id}/read`);
    qc.invalidateQueries({ queryKey: ['notifications'] });
    if (n.link) navigate(n.link);
  };
  const unread = data?.unreadCount ?? 0;
  return (
    <div className="relative" ref={ref}>
      <button type="button" className="btn-ghost relative" onClick={() => setOpen((o) => !o)} aria-label="Notificaciones">
        <Bell className="h-5 w-5" />
        {unread > 0 && <span className="absolute -right-0.5 -top-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-bold text-white">{unread > 99 ? '99+' : unread}</span>}
      </button>
      {open && (
        <div className="absolute right-0 z-40 mt-2 w-[min(22rem,calc(100vw-1.5rem))] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl">
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
            <span className="font-semibold">Notificaciones</span>
            {unread > 0 && (
              <button type="button" className="text-xs font-medium text-brand-700 hover:underline" onClick={() => readAll.mutate()}>
                Marcar todas como leídas
              </button>
            )}
          </div>
          <div className="max-h-96 overflow-y-auto">
            {!data?.items.length && <p className="px-4 py-8 text-center text-sm text-slate-500">Sin notificaciones</p>}
            {data?.items.map((n) => (
              <button key={n.id} type="button" onClick={() => openItem(n)} className={clsx('block w-full border-b border-slate-50 px-4 py-3 text-left hover:bg-slate-50', !n.readAt && 'bg-brand-50/60')}>
                <p className="flex items-center gap-2 text-sm font-semibold text-slate-800">
                  {!n.readAt && <span className="h-2 w-2 shrink-0 rounded-full bg-brand-600" />}
                  {n.title}
                </p>
                <p className="mt-0.5 text-sm text-slate-600">{n.message}</p>
                <p className="mt-1 text-xs text-slate-400">{fmtDateTime(n.createdAt)}</p>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export function Layout() {
  const { user, logout } = useAuth();
  const [drawer, setDrawer] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  useEffect(() => setDrawer(false), [location.pathname]);
  if (!user) return null;
  const items = NAV.filter((n) => n.roles.includes(user.role));
  const worker = user.role === 'WORKER';

  const nav = (
    <nav className="flex flex-col gap-0.5 p-3">
      {items.map((n) => (
        <NavLink
          key={`${n.to}-${n.label}`}
          to={n.to}
          end={n.end}
          className={({ isActive }) => clsx('flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition', isActive ? 'bg-brand-50 text-brand-800' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900')}
        >
          <n.icon className="h-5 w-5 shrink-0" />
          {n.label}
        </NavLink>
      ))}
    </nav>
  );

  const userBox = (
    <div className="border-t border-slate-100 p-3">
      <div className="mb-2 px-3">
        <p className="truncate text-sm font-semibold text-slate-800">{user.name}</p>
        <p className="text-xs text-slate-500">
          {label(user.role)} · @{user.username}
        </p>
      </div>
      <Link to="/perfil" className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-slate-600 hover:bg-slate-100">
        <KeyRound className="h-4 w-4" /> Mi cuenta
      </Link>
      <button
        type="button"
        onClick={async () => {
          await logout();
          navigate('/login');
        }}
        className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-slate-600 hover:bg-slate-100"
      >
        <LogOut className="h-4 w-4" /> Cerrar sesión
      </button>
    </div>
  );

  return (
    <div className="min-h-screen lg:pl-64">
      <aside className="fixed inset-y-0 left-0 hidden w-64 flex-col border-r border-slate-200 bg-white lg:flex">
        <div className="flex h-16 items-center border-b border-slate-100 px-5">
          <Brand />
        </div>
        <div className="flex-1 overflow-y-auto">{nav}</div>
        {userBox}
      </aside>

      {drawer && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-slate-900/50" onClick={() => setDrawer(false)} />
          <aside className="absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col bg-white shadow-xl">
            <div className="flex h-16 items-center justify-between border-b border-slate-100 px-4">
              <Brand />
              <button type="button" className="btn-ghost" onClick={() => setDrawer(false)} aria-label="Cerrar menú">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto">{nav}</div>
            {userBox}
          </aside>
        </div>
      )}

      <header className="sticky top-0 z-30 flex h-16 items-center justify-between gap-2 border-b border-slate-200 bg-white/90 px-3 backdrop-blur sm:px-6">
        <div className="flex items-center gap-2 lg:hidden">
          <button type="button" className="btn-ghost" onClick={() => setDrawer(true)} aria-label="Abrir menú">
            <Menu className="h-6 w-6" />
          </button>
          <Brand />
        </div>
        <div className="hidden text-sm text-slate-500 lg:block">
          <FileText className="mr-1 inline h-4 w-4" />
          {user.company.name}
        </div>
        <Notifications />
      </header>

      <main className={clsx('mx-auto max-w-7xl px-3 py-5 sm:px-6', worker && 'pb-24 lg:pb-5')}>
        <Outlet />
      </main>

      {worker && (
        <nav className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-slate-200 bg-white pb-[env(safe-area-inset-bottom)] lg:hidden">
          {WORKER_TABS.map((path) => {
            const n = items.find((i) => i.to === path)!;
            return (
              <NavLink key={path} to={path} end={n.end} className={({ isActive }) => clsx('flex flex-col items-center gap-0.5 py-2 text-[10px] font-medium', isActive ? 'text-brand-700' : 'text-slate-500')}>
                <n.icon className="h-5 w-5" />
                <span className="text-center leading-tight">{n.label}</span>
              </NavLink>
            );
          })}
        </nav>
      )}
    </div>
  );
}
