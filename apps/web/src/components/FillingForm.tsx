import { useState, type FormEvent } from 'react';
import { Droplets } from 'lucide-react';
import { api } from '../lib/api';
import { toLocalInput } from '../lib/format';
import type { Filling, PhotoType } from '../lib/types';
import { useProductOptions } from './hooks';
import { PhotoPicker, uploadPhotos } from './Photos';
import { Button, ErrorBox, Field } from './ui';

/**
 * Registro de llenado. Solo se captura la cantidad REALMENTE llenada:
 * no existen campos de cantidad asignada, esperada ni programada.
 */
export function FillingForm({ taskId, pointId, defaultProductId, onSaved }: { taskId?: number | null; pointId?: number | null; defaultProductId?: number | null; onSaved: (f: Filling) => void }) {
  const { data: products = [] } = useProductOptions();
  const [productId, setProductId] = useState(defaultProductId ? String(defaultProductId) : '');
  const [quantity, setQuantity] = useState('');
  const [filledAt, setFilledAt] = useState(toLocalInput(new Date()));
  const [notes, setNotes] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [photoType, setPhotoType] = useState<PhotoType>('DESPUES');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const product = products.find((p) => p.id === Number(productId));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const filling = await api.post<Filling>('/fillings', {
        taskId: taskId ?? null,
        pointId: taskId ? null : pointId,
        productId: Number(productId),
        quantity: Number(quantity),
        filledAt: filledAt ? new Date(filledAt).toISOString() : null,
        notes,
      });
      if (files.length) await uploadPhotos(files, { type: photoType, fillingId: filling.id });
      setQuantity('');
      setNotes('');
      setFiles([]);
      setFilledAt(toLocalInput(new Date()));
      onSaved(filling);
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <Field label="Producto llenado *">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {products.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => setProductId(String(p.id))}
              className={`rounded-xl border-2 px-3 py-3 text-sm font-semibold transition ${String(p.id) === productId ? 'border-brand-700 bg-brand-50 text-brand-800' : 'border-slate-200 text-slate-700 hover:border-slate-300'}`}
            >
              {p.name}
            </button>
          ))}
        </div>
      </Field>
      <Field label="Cantidad realmente llenada *" hint="Registre únicamente la cantidad que efectivamente llenó">
        <div className="flex items-center gap-2">
          <input
            className="input text-lg font-semibold"
            type="number"
            inputMode="decimal"
            step="any"
            min="0.01"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            required
            placeholder="0"
            aria-label="Cantidad realmente llenada"
          />
          <span className="min-w-10 text-base font-semibold text-slate-600">{product?.unit ?? 'L'}</span>
        </div>
      </Field>
      <Field label="Fecha y hora del llenado">
        <input className="input" type="datetime-local" value={filledAt} max={toLocalInput(new Date(Date.now() + 60_000))} onChange={(e) => setFilledAt(e.target.value)} />
      </Field>
      <Field label="Observación">
        <textarea className="input" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Opcional" />
      </Field>
      <div>
        <span className="label">Fotografías de evidencia</span>
        <div className="mb-2 flex gap-2">
          {(['ANTES', 'DESPUES', 'ADICIONAL'] as PhotoType[]).map((t) => (
            <button key={t} type="button" onClick={() => setPhotoType(t)} className={`rounded-full border px-3 py-1 text-xs ${photoType === t ? 'border-brand-700 bg-brand-50 text-brand-800' : 'border-slate-300 text-slate-600'}`}>
              {t === 'ANTES' ? 'Antes' : t === 'DESPUES' ? 'Después' : 'Adicional'}
            </button>
          ))}
        </div>
        <PhotoPicker files={files} onChange={setFiles} />
      </div>
      <ErrorBox error={error} />
      <Button type="submit" loading={busy} disabled={!productId || !quantity} className="w-full py-3 text-base">
        <Droplets className="h-5 w-5" /> Registrar llenado
      </Button>
    </form>
  );
}
