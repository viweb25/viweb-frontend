import { request } from './client';

export interface InspectionResult {
  decision: 'PASS' | 'FAIL' | 'HOLD';
  reason: string;
  model: string | null;
}

const endpoint = '/api/v1/demo/inspect';

export async function inspectImage(rule: string, image: Blob): Promise<InspectionResult> {
  const query = new URLSearchParams({ rule });
  return request<InspectionResult>(`${endpoint}?${query}`, {
    method: 'POST',
    headers: { 'Content-Type': 'image/jpeg' },
    body: image,
    signal: AbortSignal.timeout(100_000),
  });
}
