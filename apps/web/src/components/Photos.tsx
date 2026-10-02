import { useRef, useState } from 'react';
import { Camera, ImagePlus, Trash2, X } from 'lucide-react';
import { api, photoUrl } from '../lib/api';
import { fmtDateTime, label } from '../lib/format';
import type { PhotoItem, PhotoType } from '../lib/types';
import { Button, ErrorBox } from './ui';

export function PhotoGrid({ photos, onDelete }: { photos: (Pick<PhotoItem, 'id' | 'type' | 'takenAt'> & { user?: { name: string }; caption?: string | null })[]; onDelete?: (id: number) => void }) {
  const [open, setOpen] = useState<number | null>(null);
  const current = photos.find((p) => p.id === open);
  if (!photos.length) return <p className="text-sm text-slate-500">Sin fotografías.</p>;
  return (
    <>
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-6">
        {photos.map((p) => (
          <button key={p.id} type="button" onClick={() => setOpen(p.id)} className="group relative aspect-square overflow-hidden rounded-lg bg-slate-100">
            <img src={photoUrl(p.id)} alt={label(p.type)} loading="lazy" className="h-full w-full object-cover transition group-hover:scale-105" />
            <span className="absolute bottom-1 left-1 rounded bg-black/60 px-1.5 py-0.5 text-[10px] font-medium text-white">{label(p.type)}</span>
          </button>
        ))}
      </div>
      {current && (
        <div className="fixed inset-0 z-50 flex flex-col bg-black/90 p-4" onClick={() => setOpen(null)}>
          <div className="flex items-center justify-between text-sm text-white">
            <span>
              {label(current.type)} · {fmtDateTime(current.takenAt)}
              {current.user ? ` · ${current.user.name}` : ''}
              {current.caption ? ` · ${current.caption}` : ''}
            </span>
            <div className="flex gap-2">
              {onDelete && (
                <button
                  type="button"
                  className="btn-ghost text-white hover:bg-white/10"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (confirm('¿Eliminar esta fotografía?')) {
                      onDelete(current.id);
                      setOpen(null);
                    }
                  }}
                >
                  <Trash2 className="h-5 w-5" />
                </button>
              )}
              <button type="button" className="btn-ghost text-white hover:bg-white/10" aria-label="Cerrar">
                <X className="h-5 w-5" />
              </button>
            </div>
          </div>
          <img src={photoUrl(current.id)} alt="" className="m-auto max-h-[85vh] max-w-full object-contain" />
        </div>
      )}
    </>
  );
}

/** Selector de fotos (cámara o galería) con vista previa local. */
export function PhotoPicker({ files, onChange }: { files: File[]; onChange: (f: File[]) => void }) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <div>
      <div className="flex flex-wrap gap-2">
        {files.map((f, i) => (
          <div key={i} className="relative h-20 w-20 overflow-hidden rounded-lg bg-slate-100">
            <img src={URL.createObjectURL(f)} alt="" className="h-full w-full object-cover" />
            <button type="button" onClick={() => onChange(files.filter((_, j) => j !== i))} className="absolute right-0.5 top-0.5 rounded-full bg-black/60 p-0.5 text-white" aria-label="Quitar">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
        <button type="button" onClick={() => input.current?.click()} className="flex h-20 w-20 flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed border-slate-300 text-xs text-slate-500 hover:border-brand-600 hover:text-brand-700">
          <Camera className="h-5 w-5" /> Agregar
        </button>
      </div>
      <input
        ref={input}
        type="file"
        accept="image/*"
        capture="environment"
        multiple
        className="hidden"
        onChange={(e) => {
          onChange([...files, ...Array.from(e.target.files ?? [])].slice(0, 10));
          e.target.value = '';
        }}
      />
    </div>
  );
}

export async function uploadPhotos(files: File[], data: { type: PhotoType; taskId?: number | null; incidentId?: number | null; fillingId?: number | null; pointId?: number | null; caption?: string }) {
  if (!files.length) return;
  const fd = new FormData();
  files.forEach((f) => fd.append('files', f));
  for (const [k, v] of Object.entries(data)) if (v !== undefined && v !== null && v !== '') fd.append(k, String(v));
  await api.post('/photos', fd);
}

export function PhotoUploadForm({ target, onDone }: { target: { taskId?: number; incidentId?: number; pointId?: number }; onDone: () => void }) {
  const [files, setFiles] = useState<File[]>([]);
  const [type, setType] = useState<PhotoType>('ANTES');
  const [caption, setCaption] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await uploadPhotos(files, { type, caption, ...target });
      setFiles([]);
      setCaption('');
      onDone();
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {(['ANTES', 'DESPUES', 'INCIDENCIA', 'ADICIONAL'] as PhotoType[]).map((t) => (
          <button key={t} type="button" onClick={() => setType(t)} className={`rounded-full border px-3 py-1 text-sm ${type === t ? 'border-brand-700 bg-brand-50 text-brand-800' : 'border-slate-300 text-slate-600'}`}>
            {label(t)}
          </button>
        ))}
      </div>
      <PhotoPicker files={files} onChange={setFiles} />
      <input className="input" placeholder="Descripción (opcional)" value={caption} onChange={(e) => setCaption(e.target.value)} />
      <ErrorBox error={error} />
      <Button onClick={submit} loading={busy} disabled={!files.length}>
        <ImagePlus className="h-4 w-4" /> Subir {files.length ? `${files.length} foto(s)` : 'fotos'}
      </Button>
    </div>
  );
}
