import { createContext, useContext, useEffect, useState, type FormEvent, type ReactNode } from 'react';

import { loadCurrentUser, signIn, signOut, type SignedInUser } from '../services/api/auth';
import { ApiRequestError } from '../services/api/client';

const SessionContext = createContext<{
  user: SignedInUser;
  logout: () => Promise<void>;
} | null>(null);

type SignInState = 'loading' | 'anonymous' | 'unavailable';

export function SessionProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<SignedInUser | null>(null);
  const [status, setStatus] = useState<SignInState>('loading');
  const [attempt, setAttempt] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [loginError, setLoginError] = useState('');

  useEffect(() => {
    let active: AbortController | undefined;
    async function refreshSession() {
      active?.abort();
      const controller = new AbortController();
      active = controller;
      const { signal } = controller;
      try {
        const current = await loadCurrentUser(signal);
        if (!signal.aborted) setUser(current);
      } catch (error) {
        if (signal.aborted) return;
        if (!(error instanceof ApiRequestError) || error.status !== 401) {
          setStatus('unavailable');
          setUser(null);
          return;
        }
        setUser(null);
        setStatus('anonymous');
      }
    }
    void refreshSession();
    window.addEventListener('focus', refreshSession);
    return () => {
      window.removeEventListener('focus', refreshSession);
      active?.abort();
    };
  }, [attempt]);

  async function logout() {
    await signOut();
    window.history.replaceState(null, '', '/#sign-in');
    setUser(null);
    setStatus('loading');
    setAttempt(value => value + 1);
  }

  if (user) return <SessionContext.Provider key={user.id} value={{ user, logout }}>{children}</SessionContext.Provider>;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    setSubmitting(true);
    setLoginError('');
    try {
      await signIn(String(data.get('email')).trim(), String(data.get('password')));
      form.reset();
      window.history.replaceState(null, '', '/#overview');
      setStatus('loading');
      setAttempt(value => value + 1);
    } catch (error) {
      setLoginError(error instanceof ApiRequestError && [401, 429].includes(error.status)
        ? error.message : 'Could not sign in. Try again.');
    } finally {
      setSubmitting(false);
    }
  }

  return <main className="sign-in">
    <div className="sign-in-shell">
      <aside className="sign-in-brand">
        <a className="brand" href="/"><span className="brand-tile" aria-hidden="true">V</span> VI WebSync</a>
        <p>Visual inspection<br />for your team.</p>
      </aside>
      <section className="sign-in-card" aria-labelledby="sign-in-heading">
        <h1 id="sign-in-heading">Sign in</h1>
        <p className="muted">Enter your email and password to open your inspection workspace.</p>
        {status === 'loading' && <p className="sign-in-state" role="status">Checking your session…</p>}
        {status === 'unavailable' && <>
          <p className="notice" role="status">The sign-in service is temporarily unavailable.</p>
          <button className="secondary" onClick={() => {
            setStatus('loading');
            setAttempt(value => value + 1);
          }}>Try again</button>
        </>}
        {status === 'anonymous' && <form onSubmit={submit}>
          <label className="demo-field">Email
            <input name="email" type="email" autoComplete="username" maxLength={254} required />
          </label>
          <label className="demo-field">Password
            <input name="password" type="password" autoComplete="current-password" maxLength={128} required />
          </label>
          {loginError && <p className="notice" role="alert">{loginError}</p>}
          <button disabled={submitting} type="submit">{submitting ? 'Signing in…' : 'Sign in'}</button>
        </form>}
      </section>
    </div>
  </main>;
}

export function useSession() {
  const session = useContext(SessionContext);
  if (!session) throw new Error('SessionProvider is required.');
  return session;
}
