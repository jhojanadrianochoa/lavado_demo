import type { ReactNode } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useAuth } from './auth/AuthContext';
import { Layout } from './components/Layout';
import { Loading } from './components/ui';
import type { Role } from './lib/types';
import Dashboard from './pages/Dashboard';
import FillingNew from './pages/FillingNew';
import Fillings from './pages/Fillings';
import History from './pages/History';
import IncidentDetail from './pages/IncidentDetail';
import IncidentNew from './pages/IncidentNew';
import Incidents from './pages/Incidents';
import Inventory from './pages/Inventory';
import Login from './pages/Login';
import PointDetail from './pages/PointDetail';
import Points from './pages/Points';
import Products from './pages/Products';
import Profile from './pages/Profile';
import Reports from './pages/Reports';
import Requirements from './pages/Requirements';
import SettingsPage from './pages/Settings';
import TaskDetail from './pages/TaskDetail';
import Tasks from './pages/Tasks';
import Users from './pages/Users';
import WorkerHome from './pages/WorkerHome';

function Protected({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <Loading />;
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  return <>{children}</>;
}

function RoleGate({ roles, children }: { roles: Role[]; children: ReactNode }) {
  const { user } = useAuth();
  if (!user || !roles.includes(user.role)) {
    return (
      <div className="card p-8 text-center">
        <h2 className="text-lg font-semibold">Acceso restringido</h2>
        <p className="text-sm text-slate-500">No tiene permisos para ver esta sección.</p>
      </div>
    );
  }
  return <>{children}</>;
}

const MGR: Role[] = ['ADMIN', 'SUPERVISOR'];
const ADMIN: Role[] = ['ADMIN'];

export default function App() {
  const { user } = useAuth();
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route
        element={
          <Protected>
            <Layout />
          </Protected>
        }
      >
        <Route index element={user?.role === 'WORKER' ? <WorkerHome /> : <Dashboard />} />
        <Route path="puntos" element={<RoleGate roles={MGR}><Points /></RoleGate>} />
        <Route path="puntos/:id" element={<RoleGate roles={MGR}><PointDetail /></RoleGate>} />
        <Route path="tareas" element={<Tasks />} />
        <Route path="tareas/:id" element={<TaskDetail />} />
        <Route path="requerimientos" element={<Requirements />} />
        <Route path="llenados" element={<RoleGate roles={MGR}><Fillings /></RoleGate>} />
        <Route path="llenados/nuevo" element={<FillingNew />} />
        <Route path="productos" element={<RoleGate roles={ADMIN}><Products /></RoleGate>} />
        <Route path="inventario" element={<RoleGate roles={MGR}><Inventory /></RoleGate>} />
        <Route path="incidencias" element={<Incidents />} />
        <Route path="incidencias/nueva" element={<IncidentNew />} />
        <Route path="incidencias/:id" element={<IncidentDetail />} />
        <Route path="usuarios" element={<RoleGate roles={ADMIN}><Users /></RoleGate>} />
        <Route path="informes" element={<RoleGate roles={MGR}><Reports /></RoleGate>} />
        <Route path="historial" element={<History />} />
        <Route path="configuracion" element={<RoleGate roles={ADMIN}><SettingsPage /></RoleGate>} />
        <Route path="perfil" element={<Profile />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
