import { get, readApiError } from './client';

const endpoint = '/api/v1/auth';

export interface SignedInUser {
  id: string;
  display_name: string | null;
  email: string | null;
  organisations: { org_id: string; name: string; role: string }[];
}

export async function signIn(email: string, password: string) {
  const response = await fetch(`${endpoint}/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!response.ok) throw await readApiError(response);
}

export function loadCurrentUser(signal: AbortSignal) {
  return get<SignedInUser>(`${endpoint}/me`, signal);
}

export async function signOut() {
  const response = await fetch(`${endpoint}/logout`, { method: 'POST' });
  if (!response.ok) throw await readApiError(response);
}

export async function signUp(email: string, password: string, organisation: string) {
  const response = await fetch(`${endpoint}/signup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, organisation }),
  });
  if (!response.ok) throw await readApiError(response);
}

export type WorkspaceMember = { id: string; name: string; role: string };

export function listWorkspaceMembers(orgId: string, signal?: AbortSignal) {
  return get<WorkspaceMember[]>(`/api/v1/organisations/${orgId}/members`, signal);
}
