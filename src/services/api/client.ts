export class ApiRequestError extends Error {
  constructor(readonly status: number, readonly code: string, message: string) {
    super(message);
    this.name = 'ApiRequestError';
  }
}

export async function readApiError(response: Response): Promise<ApiRequestError> {
  const payload = await response.json().catch(() => null);
  const error = payload?.error;
  if (typeof error?.code === 'string' && typeof error.message === 'string') {
    return new ApiRequestError(response.status, error.code, error.message);
  }
  return new ApiRequestError(response.status, 'request_failed', `API request failed (${response.status}).`);
}

export async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const headers = new Headers(options?.headers);
  headers.set('Accept', 'application/json');
  const response = await fetch(path, { ...options, headers });
  if (!response.ok) throw await readApiError(response);
  return response.json() as Promise<T>;
}

export function get<T>(path: string, signal?: AbortSignal): Promise<T> {
  return request<T>(path, { signal });
}
