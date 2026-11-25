import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

import { AuthScreen } from '../auth/AuthScreen';
import { ApiRequestError } from '../services/api/client';
import { loadCurrentUser, signOut, type SignedInUser } from '../services/api/auth';

const SessionContext = createContext<{
  user: SignedInUser;
  logout: () => Promise<void>;
} | null>(null);

type SignInState = 'loading' | 'anonymous' | 'unavailable';

function authMode(): 'login' | 'signup' {
  return window.location.hash === '#signup' ? 'signup' : 'login';
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<SignedInUser | null>(null);
  const [status, setStatus] = useState<SignInState>('loading');
  const [attempt, setAttempt] = useState(0);
  const [mode, setMode] = useState(authMode);

  useEffect(() => {
    let active: AbortController | undefined;
    async function refreshSession() {
      active?.abort();
      const controller = new AbortController();
      active = controller;
      try {
        const current = await loadCurrentUser(controller.signal);
        if (!controller.signal.aborted) setUser(current);
      } catch (error) {
        if (controller.signal.aborted) return;
        setUser(null);
        setStatus(error instanceof ApiRequestError && error.status === 401 ? 'anonymous' : 'unavailable');
      }
    }
    void refreshSession();
    window.addEventListener('focus', refreshSession);
    return () => {
      window.removeEventListener('focus', refreshSession);
      active?.abort();
    };
  }, [attempt]);

  useEffect(() => {
    const navigate = () => setMode(authMode());
    window.addEventListener('hashchange', navigate);
    return () => window.removeEventListener('hashchange', navigate);
  }, []);

  async function logout() {
    await signOut();
    window.history.replaceState(null, '', '/#login');
    setMode('login');
    setUser(null);
    setStatus('loading');
    setAttempt(value => value + 1);
  }

  if (user) return <SessionContext.Provider key={user.id} value={{ user, logout }}>{children}</SessionContext.Provider>;

  return <AuthScreen mode={mode} status={status} onSignedIn={() => {
    setStatus('loading');
    setAttempt(value => value + 1);
  }} onRetry={() => {
    setStatus('loading');
    setAttempt(value => value + 1);
  }} />;
}

export function useSession() {
  const session = useContext(SessionContext);
  if (!session) throw new Error('SessionProvider is required.');
  return session;
}
