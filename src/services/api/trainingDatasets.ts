import { get, readApiError, request } from './client';
import type { Detection } from './inspection';

export type Point = { x: number; y: number };
export type Box = { start: Point; end: Point; label?: string | null };
export type TrainingPhoto = {
  id: string;
  filename: string;
  media_type: string;
  digest: string;
  reviewed: boolean;
  boxes: Box[];
};

export type ClassKind = 'good' | 'defect' | 'object';
export type ClassInfo = { kind: ClassKind; hint: string };

export type TrainingDataset = {
  id: string;
  part_name: string;
  inspection_note: string;
  classes?: string[];
  class_info?: Record<string, ClassInfo>;
  revision: number;
  photos: TrainingPhoto[];
};

function endpoint(orgId: string) {
  return `/api/v1/organisations/${orgId}/training-datasets`;
}

export type ProjectSummary = {
  id: string;
  part_name: string;
  classes: string[];
  class_info?: Record<string, ClassInfo>;
  updated_at: string;
  photo_count: number;
  labeled_count: number;
  model_count: number;
  latest_status: TrainingJob['status'] | null;
};

export function listTrainingDatasets(orgId: string, signal?: AbortSignal) {
  return get<ProjectSummary[]>(endpoint(orgId), signal);
}

export async function deleteTrainingDataset(orgId: string, datasetId: string) {
  const response = await fetch(`${endpoint(orgId)}/${datasetId}`, { method: 'DELETE' });
  if (!response.ok) throw await readApiError(response);
}

export function openTrainingDataset(orgId: string, datasetId: string, signal?: AbortSignal) {
  return get<TrainingDataset>(`${endpoint(orgId)}/${datasetId}`, signal);
}

export function trainingPhotoUrl(orgId: string, datasetId: string, photoId: string) {
  return `${endpoint(orgId)}/${datasetId}/photos/${photoId}`;
}

export async function trainingPhotoDigest(file: File) {
  const hash = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());
  return Array.from(new Uint8Array(hash), byte => byte.toString(16).padStart(2, '0')).join('');
}

export async function uploadTrainingPhoto(orgId: string, datasetId: string, id: string, file: File) {
  const digest = await trainingPhotoDigest(file);
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

export type ReferenceView = { id: string; name: string; counts: Record<string, number> };

export type TrainingJob = {
  id: string;
  dataset_revision: number;
  status: 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled';
  error: string | null;
  created_at: string;
  finished_at: string | null;
  reference_views: ReferenceView[];
  evaluation?: Record<string, number> | null;
  version_name?: string;
  notes?: string;
  options?: TrainingOptions | null;
  progress?: { phase: 'preparing' | 'learning' | 'checking'; epoch: number; epochs: number | null; score: number | null; eta_seconds: number | null } | null;
};

export function loadTrainingJob(orgId: string, datasetId: string, signal?: AbortSignal) {
  return get<TrainingJob | null>(`${endpoint(orgId)}/${datasetId}/jobs/latest`, signal);
}

export type TrainingOptions = {
  version_name: string;
  notes: string;
  imgsz: number;
  pretrained: boolean;
  optimizer: 'SGD' | 'Adam' | 'AdamW';
  cos_lr: boolean;
  preset: 'fast' | 'balanced' | 'accurate' | 'custom';
  model_size: 'n' | 's' | 'm' | 'l' | 'x';
} & Record<
  'validation_percent' | 'test_percent' | 'min_box_px' | 'epochs' | 'batch' | 'freeze' | 'lr0' | 'lrf' | 'warmup_epochs' | 'momentum' | 'weight_decay' | 'patience' |
  'seed' | 'box' | 'cls' | 'dfl' | 'degrees' | 'translate' | 'scale' | 'shear' | 'perspective' | 'hsv_h' |
  'hsv_s' | 'hsv_v' | 'fliplr' | 'flipud' | 'mosaic' | 'mixup' | 'close_mosaic' | 'save_period' | 'max_minutes' |
  'copy_paste' | 'erasing' | 'iou' | 'max_det',
  number
>;

export function startTrainingJob(orgId: string, datasetId: string, revision: number, options: TrainingOptions) {
  return request<TrainingJob>(`${endpoint(orgId)}/${datasetId}/jobs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ revision, options }),
  });
}

export async function cancelTrainingJob(orgId: string, datasetId: string, jobId: string) {
  const response = await fetch(`${endpoint(orgId)}/${datasetId}/jobs/${jobId}/cancel`, { method: 'POST' });
  if (!response.ok) throw await readApiError(response);
}

export function checkpointUrl(orgId: string, datasetId: string, jobId: string, variant: 'best' | 'last' = 'best') {
  return `${endpoint(orgId)}/${datasetId}/jobs/${jobId}/checkpoint?variant=${variant}`;
}

export function listCompletedJobs(orgId: string, datasetId: string, signal?: AbortSignal) {
  return get<TrainingJob[]>(`${endpoint(orgId)}/${datasetId}/jobs`, signal);
}

export type ModelCheck = {
  decision: 'PASS' | 'FAIL' | null;
  detections: Detection[];
  expected: Record<string, number>;
  found: Record<string, number>;
};

export async function previewTrainedModel(
  orgId: string, datasetId: string, jobId: string, image: Blob, confidence: number, reference: string, compare: boolean,
) {
  const query = new URLSearchParams({ confidence: String(confidence), check: String(compare) });
  if (compare && reference) query.set('reference', reference);
  const path = `${endpoint(orgId)}/${datasetId}/jobs/${jobId}/preview?${query}`;
  const options = { method: 'POST', headers: { 'Content-Type': 'image/jpeg' }, body: image };
  if (compare) return request<ModelCheck>(path, options);
  const detections = await request<Detection[]>(path, options);
  const found = new Map<string, number>();
  for (const { label } of detections) found.set(label, (found.get(label) ?? 0) + 1);
  return { decision: null, detections, expected: {}, found: Object.fromEntries(found) };
}
