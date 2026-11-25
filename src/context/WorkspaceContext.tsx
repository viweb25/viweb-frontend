import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

import { useSession } from './SessionContext';

type Organisation = { org_id: string; name: string; role: string };

const WorkspaceContext = createContext<{
  org: Organisation | null;
  organisations: Organisation[];
  canEdit: boolean;
  select: (orgId: string) => void;
} | null>(null);

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const { user } = useSession();
  const key = `vision-studio.workspace.${user.id}`;
  const [orgId, setOrgId] = useState(() => {
    try {
      return localStorage.getItem(key) ?? '';
    } catch {
      return '';
    }
  });
  const org = user.organisations.find(item => item.org_id === orgId) ?? user.organisations[0] ?? null;

  useEffect(() => {
    try {
      if (org) localStorage.setItem(key, org.org_id);
    } catch {
      // The selection still works for this session without browser storage.
    }
  }, [key, org]);

  return <WorkspaceContext.Provider value={{
    org,
    organisations: user.organisations,
    canEdit: !!org && org.role !== 'viewer',
    select: setOrgId,
  }}>{children}</WorkspaceContext.Provider>;
}

export function useWorkspace() {
  const context = useContext(WorkspaceContext);
  if (!context) throw new Error('WorkspaceProvider is required.');
  return context;
}
