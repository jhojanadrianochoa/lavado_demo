import { useState, type FormEvent } from 'react';
import { useMutation } from '@tanstack/react-query';
import { api } from '../lib/api';
import { label } from '../lib/format';
import { useAuth } from '../auth/AuthContext';
import { Button, Card, ErrorBox, Field, InfoRow, PageHeader } from '../components/ui';

export default function Profile() {
  const { user } = useAuth();
  const [form, setForm] = useState({ currentPassword: '', newPassword: '', confirm: '' });
  const [done, setDone] = useState(false);
  const save = useMutation({
    mutationFn: () => api.post('/auth/change-password', { currentPassword: form.currentPassword, newPassword: form.newPassword }),
    onSuccess: () => {
      setDone(true);
      setForm({ currentPassword: '', newPassword: '', confirm: '' });
    },
  });
  const mismatch = form.confirm.length > 0 && form.confirm !== form.newPassword;
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!mismatch) save.mutate();
  };
  if (!user) return null;
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Mi cuenta" />
      <div className="grid gap-4 md:grid-cols-2">
        <Card title="Datos">
          <dl className="divide-y divide-slate-100">
            <InfoRow label="Nombre">{user.name}</InfoRow>
            <InfoRow label="Usuario">@{user.username}</InfoRow>
            <InfoRow label="Rol">{label(user.role)}</InfoRow>
            <InfoRow label="Correo">{user.email}</InfoRow>
            <InfoRow label="Puntos">{user.points.map((p) => p.point.name).join(', ') || (user.role === 'ADMIN' ? 'Todos' : '—')}</InfoRow>
          </dl>
        </Card>
        <Card title="Cambiar contraseña">
          <form onSubmit={submit} className="space-y-3">
            <Field label="Contraseña actual">
              <input className="input" type="password" autoComplete="current-password" value={form.currentPassword} onChange={(e) => setForm({ ...form, currentPassword: e.target.value })} required />
            </Field>
            <Field label="Nueva contraseña" hint="Mínimo 8 caracteres">
              <input className="input" type="password" autoComplete="new-password" value={form.newPassword} onChange={(e) => setForm({ ...form, newPassword: e.target.value })} required minLength={8} />
            </Field>
            <Field label="Confirmar nueva contraseña" error={mismatch ? 'Las contraseñas no coinciden' : undefined}>
              <input className="input" type="password" autoComplete="new-password" value={form.confirm} onChange={(e) => setForm({ ...form, confirm: e.target.value })} required />
            </Field>
            <ErrorBox error={save.error} />
            {done && <p className="text-sm text-emerald-700">Contraseña actualizada.</p>}
            <Button type="submit" loading={save.isPending} disabled={mismatch}>Guardar</Button>
          </form>
        </Card>
      </div>
    </div>
  );
}
