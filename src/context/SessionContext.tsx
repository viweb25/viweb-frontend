import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

import { AccountLinkScreen, type AccountAction } from '../auth/AccountLinkScreen';
import { AuthScreen } from '../auth/AuthScreen';
import { ApiRequestError } from '../services/api/client';
import { authHref, navigate, safeReturnTo, useAccountToken, useLocation } from '../ui/navigation';
import { loadCurrentUser, signOut, type SignedInUser } from '../services/api/auth';

const SessionContext = createContext<{
  user: SignedInUser;
  logout: () => Promise<void>;
} | null>(null);

type SignInState = 'loading' | 'anonymous' | 'unavailable';

export function SessionProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<SignedInUser | null>(null);
  const [status, setStatus] = useState<SignInState>('loading');
  const [attempt, setAttempt] = useState(0);
  const [pathname, search] = useLocation().split(/\?(.*)/s, 2);
  const path = pathname.replace(/\/$/, '') || '/';
  const mode = path === '/signup' ? 'signup' : 'login';
  const onAuthPage = path === '/login' || path === '/signup';
  const accountAction: AccountAction | null =
    path === '/forgot' ? 'forgot' : path === '/reset' ? 'reset' : path === '/invite' ? 'invite' : null;
  const token = useAccountToken(accountAction === 'forgot' ? null : accountAction);
  const next = safeReturnTo(new URLSearchParams(search).get('next'));
  const privateLocation = pathname + (search === undefined ? '' : `?${search}`);

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
    if (accountAction) return;
    if (user && onAuthPage) navigate(next, true);
    if (!user && status === 'anonymous' && !onAuthPage) {
      navigate(authHref('login', privateLocation), true);
    }
  }, [accountAction, user, status, onAuthPage, next, privateLocation]);

  async function logout() {
    await signOut();
    setUser(null);
    setStatus('loading');
    navigate('/login', true);
    setAttempt(value => value + 1);
  }

  if (accountAction) return <AccountLinkScreen key={path} action={accountAction} token={token ?? ''} next={next}
    onContinue={() => {
      if (accountAction === 'reset') setUser(null);
      navigate(user && accountAction !== 'reset' ? next : authHref('login', next), true);
      setStatus('loading');
      setAttempt(value => value + 1);
    }} />;

  if (user) return <SessionContext.Provider key={user.id} value={{ user, logout }}>{children}</SessionContext.Provider>;

  return <AuthScreen mode={mode} next={next} status={status} onSignedIn={() => {
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
