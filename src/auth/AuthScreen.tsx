import { useState, type FormEvent } from 'react';

import { ApiRequestError } from '../services/api/client';
import { signIn, signUp } from '../services/api/auth';
import { Icon, Logo, type IconName } from '../ui/Icon';
import { authHref, navigate } from '../ui/navigation';

type Props = {
  mode: 'login' | 'signup';
  next: string;
  status: 'loading' | 'anonymous' | 'unavailable';
  onSignedIn: () => void;
  onRetry: () => void;
};

const MIN_PASSWORD = 15;

function strength(password: string) {
  let score = 0;
  if (password.length >= MIN_PASSWORD) score++;
  if (password.length >= 20) score++;
  if (/[A-Z]/.test(password) && /[a-z]/.test(password)) score++;
  if (/\d/.test(password) || /[^A-Za-z0-9]/.test(password)) score++;
  return password.length < MIN_PASSWORD ? Math.min(score, 1) : score;
}

const FEATURES: { icon: IconName; title: string; description: string }[] = [
  { icon: 'layers', title: 'Projects and model training', description: 'Organize photos, label examples, and test model versions.' },
  { icon: 'camera', title: 'Inspection programs', description: 'Publish checks and run them from a camera or an uploaded photo.' },
  { icon: 'flag', title: 'Results and review', description: 'Review flagged items, keep a history, and export results.' },
  { icon: 'team', title: 'Team workspaces', description: 'Invite teammates and assign roles for shared work.' },
];

export function AuthScreen({ mode, next, status, onSignedIn, onRetry }: Props) {
  const signup = mode === 'signup';
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [workspace, setWorkspace] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [created, setCreated] = useState(false);
  const score = strength(password);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setError('');
    if (signup && password.length < MIN_PASSWORD) {
      setError(`Use at least ${MIN_PASSWORD} characters for your password.`);
      return;
    }
    if (signup && password !== confirm) {
      setError('The two passwords do not match.');
      return;
    }
    setBusy(true);
    let accountCreated = false;
    try {
      if (signup) {
        await signUp(email.trim(), password, workspace.trim());
        accountCreated = true;
        setCreated(true);
      }
      await signIn(email.trim(), password);
      onSignedIn();
    } catch (cause) {
      if (accountCreated) {
        navigate(authHref('login', next), true);
        setError('Your account was created, but we could not sign you in. Log in to continue.');
      } else if (cause instanceof ApiRequestError && [401, 403, 409, 422, 429, 503].includes(cause.status)) {
        setError(cause.message);
      } else {
        setError(signup ? 'We could not create your account. Check the form and try again.' : 'We could not sign you in. Try again.');
      }
    } finally {
      setBusy(false);
    }
  }

  return <main className="auth">
    <aside className="auth-brand">
      <a className="brand" href="/"><Logo /> Vision Studio</a>
      <div className="auth-pitch">
        <h2>A workspace for visual inspection</h2>
        <p>Set up checks, run them with your team, and track what happens over time.</p>
      </div>
      <ul className="auth-features">
        {FEATURES.map(feature => <li key={feature.title}>
          <span className="workspace-icon"><Icon name={feature.icon} /></span>
          <div><strong>{feature.title}</strong><p>{feature.description}</p></div>
        </li>)}
      </ul>
      <p className="auth-module-note"><Icon name="target" /> Object detection is the first available inspection tool.</p>
    </aside>

    <section className="auth-main">
      <div className="auth-card">
        <header>
          <h1>{signup ? 'Create your account' : 'Welcome back'}</h1>
          <p>{signup ? 'Create a workspace to manage inspections with your team.' : 'Log in to continue to your workspace.'}</p>
        </header>
        <nav className="auth-tabs" aria-label="Account">
          <a href={authHref('login', next)} aria-current={!signup ? 'page' : undefined}>Log in</a>
          <a href={authHref('signup', next)} aria-current={signup ? 'page' : undefined}>Sign up</a>
        </nav>

        {status === 'loading' && <div className="loading" role="status"><span className="spinner" />Checking your session…</div>}
        {status === 'unavailable' && <div className="alert" role="alert">
          <Icon name="alert" />
          <div className="spacer">The sign-in service is not reachable right now.</div>
          <button type="button" className="btn ghost small" onClick={onRetry}>Try again</button>
        </div>}

        {status === 'anonymous' && <form className="auth-form" onSubmit={event => void submit(event)} key={mode}>
          {!signup && created && <div className="success" role="status"><Icon name="check" />Account created. Log in with your new password.</div>}
          {signup && <label className="field">Workspace name
            <span className="input-icon"><Icon name="building" />
              <input required maxLength={200} autoComplete="organization" placeholder="e.g. Acme Manufacturing"
                value={workspace} onChange={event => setWorkspace(event.target.value)} /></span>
            <small>Your company or team. You can invite others later.</small>
          </label>}
          <label className="field">Email
            <span className="input-icon"><Icon name="mail" />
              <input type="email" required maxLength={254} autoComplete="username" placeholder="you@company.com"
                value={email} onChange={event => setEmail(event.target.value)} /></span>
          </label>
          <label className="field">Password
            <span className="input-icon"><Icon name="lock" />
              <input type={show ? 'text' : 'password'} required maxLength={128}
                minLength={signup ? MIN_PASSWORD : 1} autoComplete={signup ? 'new-password' : 'current-password'}
                value={password} onChange={event => setPassword(event.target.value)} />
              <button type="button" className="icon-btn reveal" aria-label={show ? 'Hide password' : 'Show password'}
                aria-pressed={show} onClick={() => setShow(value => !value)}><Icon name="eye" /></button>
            </span>
            {signup && <>
              <span className="password-meter" aria-hidden="true">
                {[0, 1, 2, 3].map(index => <span key={index} className={`${index < score ? 'on' : ''} ${score >= 3 ? 'strong' : ''}`} />)}
              </span>
              <small>{password.length < MIN_PASSWORD
                ? `${MIN_PASSWORD - password.length} more characters needed. A short sentence works well.`
                : score >= 3 ? 'Strong password.' : 'Good. Mixing cases or adding numbers makes it stronger.'}</small>
            </>}
          </label>
          {signup && <label className="field">Confirm password
            <span className="input-icon"><Icon name="lock" />
              <input type={show ? 'text' : 'password'} required maxLength={128} minLength={MIN_PASSWORD}
                autoComplete="new-password" value={confirm} onChange={event => setConfirm(event.target.value)} /></span>
          </label>}
          {!signup && <a href={authHref('forgot', next)}>Forgot your password?</a>}
          {error && <div className="alert" role="alert"><Icon name="alert" />{error}</div>}
          <button type="submit" className="btn block large" disabled={busy}>
            {busy ? <><span className="spinner" aria-hidden="true" />{signup ? 'Creating account…' : 'Logging in…'}</>
              : <>{signup ? 'Create account' : 'Log in'} <Icon name="arrow" /></>}
          </button>
          <p className="auth-foot">{signup
            ? <>Already have an account? <a href={authHref('login', next)}>Log in</a></>
            : <>New to Vision Studio? <a href={authHref('signup', next)}>Create an account</a></>}</p>
        </form>}
      </div>
    </section>
  </main>;
}
