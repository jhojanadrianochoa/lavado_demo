import { useState, type FormEvent } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Droplets, LogIn } from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { api } from '../lib/api';
import { Button, ErrorBox } from '../components/ui';

export default function Login() {
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const { data: brand } = useQuery({ queryKey: ['branding'], queryFn: () => api.get<{ companyName: string; hasLogo: boolean }>('/public/branding') });
  const from = (location.state as { from?: string } | null)?.from ?? '/';
  if (user) return <Navigate to={from} replace />;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await login(username, password);
      navigate(from, { replace: true });
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-brand-800 via-brand-700 to-brand-500 p-4">
      <form onSubmit={submit} className="w-full max-w-sm rounded-2xl bg-white p-7 shadow-2xl">
        <div className="mb-6 flex flex-col items-center text-center">
          {brand?.hasLogo ? (
            <img src="/api/public/logo" alt="" className="mb-3 h-16 w-16 object-contain" />
          ) : (
            <span className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-700 text-white">
              <Droplets className="h-8 w-8" />
            </span>
          )}
          <h1 className="text-2xl font-bold text-slate-900">{brand?.companyName ?? 'LavaControl'}</h1>
          <p className="text-sm text-slate-500">Gestión de puntos de lavado</p>
        </div>
        <div className="space-y-4">
          <label className="block">
            <span className="label">Usuario</span>
            <input className="input" autoComplete="username" autoCapitalize="none" value={username} onChange={(e) => setUsername(e.target.value)} required autoFocus />
          </label>
          <label className="block">
            <span className="label">Contraseña</span>
            <input className="input" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          </label>
          <ErrorBox error={error} />
          <Button type="submit" loading={busy} className="w-full">
            <LogIn className="h-4 w-4" /> Iniciar sesión
          </Button>
        </div>
      </form>
    </div>
  );
}
