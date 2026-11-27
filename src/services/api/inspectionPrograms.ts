import { get, readApiError, request } from './client';
import type { Detection } from './inspection';

export type Decision = 'PASS' | 'FAIL' | 'REVIEW';
export type ReviewStatus = 'none' | 'pending' | 'confirmed' | 'corrected';

/** One area of the board and how many of each class must be found in it. Coordinates are 0–1. */
export type Zone = {
  id: string;
  name: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  expected: Record<string, number>;
  critical: boolean;
};

export type InspectionProgram = {
  id: string;
  name: string;
  dataset_id: string;
  model_job_id: string | null;
  confidence: number;
  review_margin: number;
  revision: number;
  updated_at: string | null;
  published_revision: number | null;
  zones: Zone[];
  classes: string[];
  defect_classes: string[];
};

export type ProgramSummary = {
  id: string;
  name: string;
  dataset_id: string;
  dataset_name: string;
  model_job_id: string | null;
  zone_count: number;
  run_count: number;
  pass_count: number;
  pending_reviews: number;
  published_revision: number | null;
  published_name: string | null;
  last_run_at: string | null;
  updated_at: string;
};

export type ZoneResult = {
  zone_id: string;
  name: string;
  decision: Decision;
  critical: boolean;
  expected: Record<string, number>;
  found: Record<string, number>;
  missing: Record<string, number>;
  extra: Record<string, number>;
  defects: string[];
  uncertain: number;
};

export type InspectionRun = {
  id: string;
  program_id: string;
  program_name: string;
  dataset_id: string | null;
  model_job_id: string | null;
  decision: Decision;
  zone_results: ZoneResult[];
  detections: Detection[];
  confidence: number;
  created_at: string | null;
  review_status: ReviewStatus;
  review_note: string;
  reviewed_at: string | null;
  sent_to_dataset_at: string | null;
  dataset_archived?: boolean;
  program_snapshot?: {
    revision: number;
    classes: string[];
    zones: (Omit<Zone, 'x1' | 'y1' | 'x2' | 'y2'> & {
      region: Pick<Zone, 'x1' | 'y1' | 'x2' | 'y2'>;
    })[];
  } | null;
};

export type GoldenLayout = { expected: Record<string, Record<string, number>>; detections: Detection[]; outside: number };

export type RunCursor = { at: string; id: string };
export type RunFilters = {
  programId?: string; decision?: Decision; reviewStatus?: ReviewStatus;
  fromAt?: string; untilAt?: string; limit?: number; before?: RunCursor;
};
export type ResultProgram = { id: string; name: string };

const programs = (orgId: string) => `/api/v1/organisations/${orgId}/inspection-programs`;
const runs = (orgId: string) => `/api/v1/organisations/${orgId}/inspection-runs`;
const jpeg = (image: Blob) => ({ method: 'POST', headers: { 'Content-Type': 'image/jpeg' }, body: image });
const json = (method: string, body: unknown) => ({ method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

/* ---------- Programs ---------- */

export function listPrograms(orgId: string, signal?: AbortSignal) {
  return get<ProgramSummary[]>(programs(orgId), signal);
}

export function createProgram(orgId: string, name: string, datasetId: string) {
  return request<InspectionProgram>(programs(orgId), json('POST', { name, dataset_id: datasetId }));
}

export function openProgram(orgId: string, programId: string, signal?: AbortSignal) {
  return get<InspectionProgram>(`${programs(orgId)}/${programId}`, signal);
}

export function saveProgram(orgId: string, program: InspectionProgram) {
  const { name, model_job_id, confidence, review_margin, revision, zones } = program;
  return request<{ revision: number }>(`${programs(orgId)}/${program.id}`,
    json('PUT', { name, model_job_id, confidence, review_margin, revision, zones }));
}

export async function deleteProgram(orgId: string, programId: string) {
  const response = await fetch(`${programs(orgId)}/${programId}`, { method: 'DELETE' });
  if (!response.ok) throw await readApiError(response);
}

/** Propose expected counts per zone from a photo of a known-good board (saved zones are used). */
export function captureGolden(orgId: string, programId: string, image: Blob) {
  return request<GoldenLayout>(`${programs(orgId)}/${programId}/golden`, jpeg(image));
}

export function listProgramVersions(orgId: string, programId: string, signal?: AbortSignal) {
  return get<number[]>(`${programs(orgId)}/${programId}/versions`, signal);
}

export async function activateProgram(
  orgId: string, programId: string, revision: number, action: 'publish' | 'rollback',
) {
  const response = await fetch(`${programs(orgId)}/${programId}/${action}?revision=${revision}`, { method: 'POST' });
  if (!response.ok) throw await readApiError(response);
}

export function testProgramDraft(orgId: string, programId: string, revision: number, image: Blob) {
  return request<InspectionRun>(`${programs(orgId)}/${programId}/test?revision=${revision}`, jpeg(image));
}

/** Inspect one board photo. The result is logged. */
export function inspectBoard(orgId: string, programId: string, image: Blob, revision?: number) {
  const query = revision === undefined ? '' : `?revision=${revision}`;
  return request<InspectionRun>(`${programs(orgId)}/${programId}/runs${query}`, jpeg(image));
}

/* ---------- Results ---------- */

function resultQuery(filters: RunFilters) {
  const query = new URLSearchParams();
  if (filters.programId) query.set('program_id', filters.programId);
  if (filters.decision) query.set('decision', filters.decision);
  if (filters.reviewStatus) query.set('review_status', filters.reviewStatus);
  if (filters.fromAt) query.set('from_at', filters.fromAt);
  if (filters.untilAt) query.set('until_at', filters.untilAt);
  return query;
}

export function listRuns(orgId: string, filters: RunFilters = {}, signal?: AbortSignal) {
  const query = resultQuery(filters);
  if (filters.limit) query.set('limit', String(filters.limit));
  if (filters.before) {
    query.set('before_at', filters.before.at);
    query.set('before_id', filters.before.id);
  }
  return get<InspectionRun[]>(`${runs(orgId)}?${query}`, signal);
}

export function listResultPrograms(orgId: string, signal?: AbortSignal) {
  return get<ResultProgram[]>(`${runs(orgId)}/programs`, signal);
}

export function resultsCsvUrl(orgId: string, filters: RunFilters) {
  return `${runs(orgId)}/export.csv?${resultQuery(filters)}`;
}

export function openRun(orgId: string, runId: string, signal?: AbortSignal) {
  return get<InspectionRun>(`${runs(orgId)}/${runId}`, signal);
}

export function runImageUrl(orgId: string, runId: string) {
  return `${runs(orgId)}/${runId}/image`;
}

export async function reviewRun(orgId: string, runId: string, status: Exclude<ReviewStatus, 'none'>, note = '') {
  const response = await fetch(`${runs(orgId)}/${runId}/review`, json('POST', { status, note }));
  if (!response.ok) throw await readApiError(response);
}

/** Add the run's photo to its project (unlabeled, with suggested boxes) for retraining. */
export function sendRunToDataset(orgId: string, runId: string) {
  return request<{ photo_id: string }>(`${runs(orgId)}/${runId}/send-to-dataset`, { method: 'POST' });
}
