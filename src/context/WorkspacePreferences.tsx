import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

import { useSession } from './SessionContext';

type Preferences = { workspaceName: string; acceptanceRule: string };

const defaults: Preferences = { workspaceName: '', acceptanceRule: '' };
const WorkspaceContext = createContext<{
  preferences: Preferences;
  update: (values: Partial<Preferences>) => void;
} | null>(null);

function readPreferences(storageKey: string): Preferences {
  try {
    const value = JSON.parse(localStorage.getItem(storageKey) ?? 'null');
    return {
      workspaceName: typeof value?.workspaceName === 'string' ? value.workspaceName.slice(0, 80) : '',
      acceptanceRule: typeof value?.acceptanceRule === 'string' ? value.acceptanceRule.slice(0, 400) : '',
    };
  } catch {
    return defaults;
  }
}

export function WorkspacePreferences({ children }: { children: ReactNode }) {
  const { user } = useSession();
  const storageKey = `viweb.workspace-preferences.v1.${user.id}`;
  const [preferences, setPreferences] = useState(() => readPreferences(storageKey));
  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(preferences));
    } catch {
      // Preferences remain available in this session if browser storage is disabled.
    }
  }, [preferences, storageKey]);
  return <WorkspaceContext.Provider value={{
    preferences,
    update: values => setPreferences(previous => ({ ...previous, ...values })),
  }}>{children}</WorkspaceContext.Provider>;
}

export function useWorkspacePreferences() {
  const context = useContext(WorkspaceContext);
  if (!context) throw new Error('WorkspacePreferences provider is required.');
  return context;
}
