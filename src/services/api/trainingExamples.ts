import { get, request } from './client';

export type Label = 'PASS' | 'FAIL';

export interface Example {
  id: string;
  part_id: string;
  label: Label;
  created_at: string;
}

const endpoint = '/api/v1/demo/examples';

export function exampleImage(id: string) {
  return `${endpoint}/${encodeURIComponent(id)}/image`;
}

export async function loadExamples(signal: AbortSignal): Promise<Example[]> {
  return get<Example[]>(endpoint, signal);
}

export async function saveExample(partId: string, label: Label, image: Blob): Promise<Example> {
  const query = new URLSearchParams({ part_id: partId, label });
  return request<Example>(`${endpoint}?${query}`, {
    method: 'POST',
    headers: { 'Content-Type': 'image/jpeg' },
    body: image,
  });
}
