import { get, readApiError, request } from './client';
import type { Detection } from './inspection';

export type Point = { x: number; y: number };
export type Box = { start: Point; end: Point };
export type TrainingPhoto = {
  id: string;
  filename: string;
  media_type: string;
  digest: string;
  reviewed: boolean;
  boxes: Box[];
};

export type TrainingDataset = {
  id: string;
  part_name: string;
  inspection_note: string;
  revision: number;
  photos: TrainingPhoto[];
};

function endpoint(orgId: string) {
  return `/api/v1/organisations/${orgId}/training-datasets`;
}

export function listTrainingDatasets(orgId: string, signal?: AbortSignal) {
  return get<Pick<TrainingDataset, 'id' | 'part_name'>[]>(endpoint(orgId), signal);
}

export function openTrainingDataset(orgId: string, datasetId: string) {
  return get<TrainingDataset>(`${endpoint(orgId)}/${datasetId}`);
}

export function trainingPhotoUrl(orgId: string, datasetId: string, photoId: string) {
  return `${endpoint(orgId)}/${datasetId}/photos/${photoId}`;
}

export async function uploadTrainingPhoto(orgId: string, datasetId: string, id: string, file: File) {
  const hash = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());
  const digest = Array.from(new Uint8Array(hash), byte => byte.toString(16).padStart(2, '0')).join('');
  const response = await fetch(`${endpoint(orgId)}/${datasetId}/uploads/${id}/${digest}`, {
    method: 'PUT',
    headers: { 'Content-Type': file.type },
    body: file,
  });
  if (!response.ok) throw await readApiError(response);
  return digest;
}

export function saveTrainingDataset(orgId: string, dataset: TrainingDataset) {
  const { id, ...body } = dataset;
  return request<{ revision: number }>(`${endpoint(orgId)}/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

export type TrainingJob = {
  id: string;
  dataset_revision: number;
  status: 'queued' | 'running' | 'succeeded' | 'failed';
  error: string | null;
  created_at: string;
  finished_at: string | null;
};

export function loadTrainingJob(orgId: string, datasetId: string, signal?: AbortSignal) {
  return get<TrainingJob | null>(`${endpoint(orgId)}/${datasetId}/jobs/latest`, signal);
}

export function startTrainingJob(orgId: string, datasetId: string, revision: number) {
  return request<TrainingJob>(`${endpoint(orgId)}/${datasetId}/jobs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ revision }),
  });
}

export function checkpointUrl(orgId: string, datasetId: string, jobId: string) {
  return `${endpoint(orgId)}/${datasetId}/jobs/${jobId}/checkpoint`;
}

export function listCompletedJobs(orgId: string, datasetId: string, signal: AbortSignal) {
  return get<TrainingJob[]>(`${endpoint(orgId)}/${datasetId}/jobs`, signal);
}

export function previewTrainedModel(
  orgId: string, datasetId: string, jobId: string, image: Blob, confidence: number,
) {
  const query = new URLSearchParams({ confidence: String(confidence) });
  return request<Detection[]>(
    `${endpoint(orgId)}/${datasetId}/jobs/${jobId}/preview?${query}`,
    { method: 'POST', headers: { 'Content-Type': 'image/jpeg' }, body: image },
  );
}
