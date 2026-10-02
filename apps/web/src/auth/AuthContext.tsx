import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import type { Me, Role } from '../lib/types';

interface AuthState {
  user: Me | null;
  loading: boolean;
  login: (username: string, password: string) => Promise<Me>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
  hasRole: (...roles: Role[]) => boolean;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);
  const qc = useQueryClient();

  const refresh = useCallback(async () => {
    try {
      setUser(await api.get<Me>('/auth/me'));
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
    const onUnauthorized = () => {
      setUser(null);
      qc.clear();
    };
    window.addEventListener('lc:unauthorized', onUnauthorized);
    return () => window.removeEventListener('lc:unauthorized', onUnauthorized);
  }, [refresh, qc]);

  const login = async (username: string, password: string) => {
    const me = await api.post<Me>('/auth/login', { username, password });
    qc.clear();
    setUser(me);
    return me;
  };

  const logout = async () => {
    await api.post('/auth/logout').catch(() => undefined);
    qc.clear();
    setUser(null);
  };

  const hasRole = (...roles: Role[]) => Boolean(user && roles.includes(user.role));

  return <AuthContext.Provider value={{ user, loading, login, logout, refresh, hasRole }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth debe usarse dentro de AuthProvider');
  return ctx;
}
