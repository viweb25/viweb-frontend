import { get } from './client';

export type Template = { id: string; name: string; stage: string; config_schema: Record<string, unknown> };

const endpoint = '/api/v1/function-templates';

export function loadCatalogue(signal: AbortSignal) {
  return get<Template[]>(endpoint, signal);
}
