import { createContext, useContext, useEffect, useState, type FormEvent, type ReactNode } from 'react';

import { loadCurrentUser, signIn, signOut, signUp, type SignedInUser } from '../services/api/auth';
import { InspectionIllustration, WorkspaceIcon } from '../WorkspaceIcon';
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
  const [signup, setSignup] = useState(false);
  const [registeredEmail, setRegisteredEmail] = useState('');

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
    let accountCreated = false;
    try {
      const email = String(data.get('email')).trim();
      const password = String(data.get('password'));
      if (signup) {
        if (password !== data.get('confirm_password')) {
          setLoginError('The passwords do not match.');
          return;
        }
        await signUp(email, password, String(data.get('organisation')).trim());
        accountCreated = true;
        setRegisteredEmail(email);
        setSignup(false);
      }
      await signIn(email, password);
      form.reset();
      setRegisteredEmail('');
      window.history.replaceState(null, '', '/#overview');
      setStatus('loading');
      setAttempt(value => value + 1);
    } catch (error) {
      setLoginError(error instanceof ApiRequestError && [401, 403, 409, 429, 503].includes(error.status)
        ? error.message : signup && !accountCreated ? 'Could not create the account. Check the form and try again.'
          : 'Could not sign in. Try again.');
    } finally {
      setSubmitting(false);
    }
  }

  return <main className="sign-in">
    <div className="sign-in-shell">
      <aside className="sign-in-brand">
        <a className="brand" href="/"><span className="brand-tile"><WorkspaceIcon name="brand" /></span> VI WebSync</a>
        <div className="sign-in-intro">
          <h2>Visual inspection for your production line</h2>
          <p>Check parts from a photo or camera and train a model using your own examples.</p>
        </div>
        <InspectionIllustration />
      </aside>
      <section className="sign-in-card" aria-labelledby="sign-in-heading">
        <h1 id="sign-in-heading">{signup ? 'Create your account' : 'Sign in'}</h1>
        <p className="muted">{signup ? 'Enter your workspace name, email, and password.' : 'Sign in to open your inspection workspace.'}</p>
        {status === 'loading' && <p className="sign-in-state" role="status">Checking your session…</p>}
        {status === 'unavailable' && <>
          <p className="notice" role="status">The sign-in service is temporarily unavailable.</p>
          <button className="secondary" onClick={() => {
            setStatus('loading');
            setAttempt(value => value + 1);
          }}>Try again</button>
        </>}
        {status === 'anonymous' && <>
          {!signup && registeredEmail && <p role="status">Account created. Sign in with your new password.</p>}
          <form key={signup ? 'signup' : 'login'} onSubmit={submit}>
          {signup && <label className="demo-field">Company or workspace name
            <input name="organisation" autoComplete="organization" maxLength={200} required />
          </label>}
          <label className="demo-field">Email
            <input name="email" type="email" autoComplete="username" defaultValue={registeredEmail} maxLength={254} required />
          </label>
          <label className="demo-field">Password
            <input name="password" type="password" autoComplete={signup ? "new-password" : "current-password"} minLength={signup ? 15 : 1} maxLength={128} required />
          </label>
          {signup && <label className="demo-field">Confirm password
            <input name="confirm_password" type="password" autoComplete="new-password"
              minLength={15} maxLength={128} required />
          </label>}
          {signup && <p className="muted">Use at least 15 characters for your password.</p>}
          {loginError && <p className="notice" role="alert">{loginError}</p>}
          <button disabled={submitting} type="submit">{signup
            ? submitting ? 'Creating account…' : 'Create account'
            : submitting ? 'Signing in…' : 'Sign in'}</button>
          </form>
          <button className="secondary" type="button" disabled={submitting} onClick={() => {
            setLoginError('');
            setSignup(value => !value);
          }}>{signup ? 'Back to sign in' : 'Create an account'}</button>
        </>}
      </section>
    </div>
  </main>;
}

export function useSession() {
  const session = useContext(SessionContext);
  if (!session) throw new Error('SessionProvider is required.');
  return session;
}
