export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public details?: Record<string, string[] | undefined>,
  ) {
    super(message);
  }
}

type Params = Record<string, string | number | boolean | null | undefined>;

export function qs(params?: Params) {
  if (!params) return '';
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== '') sp.set(k, String(v));
  }
  const s = sp.toString();
  return s ? `?${s}` : '';
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const isForm = body instanceof FormData;
  const res = await fetch(`/api${path}`, {
    method,
    credentials: 'include',
    headers: body && !isForm ? { 'Content-Type': 'application/json' } : undefined,
    body: body === undefined ? undefined : isForm ? body : JSON.stringify(body),
  });
  if (res.status === 401 && path !== '/auth/me' && path !== '/auth/login') {
    window.dispatchEvent(new Event('lc:unauthorized'));
  }
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) {
    let message = data?.message ?? 'Error de comunicación con el servidor';
    const details = data?.details as Record<string, string[] | undefined> | undefined;
    if (details && typeof details === 'object') {
      const first = Object.entries(details).find(([, v]) => Array.isArray(v) && v.length);
      if (first) message = `${message}: ${first[1]![0]}`;
    }
    throw new ApiError(res.status, message, details);
  }
  return data as T;
}

export const api = {
  get: <T>(path: string, params?: Params) => request<T>('GET', `${path}${qs(params)}`),
  post: <T>(path: string, body?: unknown) => request<T>('POST', path, body ?? {}),
  put: <T>(path: string, body: unknown) => request<T>('PUT', path, body),
  patch: <T>(path: string, body: unknown) => request<T>('PATCH', path, body),
  del: <T>(path: string) => request<T>('DELETE', path),
};

export const photoUrl = (id: number) => `/api/photos/${id}/file`;
