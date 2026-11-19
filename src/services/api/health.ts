import { get } from './client';

const endpoint = '/health/live';

export function loadHealth(signal: AbortSignal) {
  return get<{ status: string; service: string }>(endpoint, signal);
}
