import { get, request } from './client';

export interface Detection {
  label: string;
  confidence: number;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface InspectionResult {
  decision: 'PASS' | 'FAIL' | 'HOLD';
  reason: string;
  model: string | null;
  detections?: Detection[];
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

export async function detectObjects(target: string, count: number, confidence: number, image: Blob): Promise<InspectionResult> {
  const query = new URLSearchParams({ target, expected_count: String(count), confidence: String(confidence) });
  return request<InspectionResult>(`/api/v1/demo/detect?${query}`, {
    method: 'POST',
    headers: { 'Content-Type': 'image/jpeg' },
    body: image,
    signal: AbortSignal.timeout(100_000),
  });
}


export interface DetectionModel {
  status: 'ready' | 'missing' | 'unavailable';
  classes: string[];
  model: string | null;
}

export function loadDetectionModel(signal: AbortSignal) {
  return get<DetectionModel>('/api/v1/demo/detection-model', signal);
}
