import { useState, type FormEvent } from 'react';

import { acceptWorkspaceInvitation, requestPasswordRecovery, resetPassword } from '../services/api/auth';
import { ApiRequestError } from '../services/api/client';
import { Icon, Logo } from '../ui/Icon';
import { authHref, clearAccountToken } from '../ui/navigation';

export type AccountAction = 'forgot' | 'reset' | 'invite';

export function AccountLinkScreen({ action, token, next, onContinue }: {
  action: AccountAction;
  token: string;
  next: string;
  onContinue: () => void;
}) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [needsPassword, setNeedsPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [complete, setComplete] = useState(false);
  const usePassword = action === 'reset' || needsPassword;
  const missingToken = action !== 'forgot' && !token;
  const title = action === 'invite' ? 'Join your workspace' : 'Reset your password';

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy || missingToken) return;
    setError('');
    if (usePassword && password !== confirm) {
      setError('The two passwords do not match.');
      return;
    }
    setBusy(true);
    try {
      if (action === 'forgot') await requestPasswordRecovery(email.trim());
      if (action === 'reset') await resetPassword(token, password);
      if (action === 'invite') await acceptWorkspaceInvitation(token, needsPassword ? password : undefined);
      setPassword('');
      setConfirm('');
      setComplete(true);
      if (action !== 'forgot') clearAccountToken();
    } catch (cause) {
      if (action === 'invite' && cause instanceof ApiRequestError && cause.code === 'password_required') {
        setNeedsPassword(true);
      } else {
        setError(cause instanceof ApiRequestError ? cause.message : 'Something went wrong. Try again.');
      }
    } finally {
      setBusy(false);
    }
  }

  return <main className="auth-main">
    <section className="auth-card">
      <a className="brand" href={authHref('login', next)}><Logo /> Vision Studio</a>
      <header><h1>{title}</h1></header>
      {complete ? <>
        <p role="status">{action === 'forgot'
          ? 'If an account uses that email, a recovery link will arrive shortly.'
          : action === 'reset' ? 'Your password has been updated.' : 'Invitation accepted.'}</p>
        <button type="button" className="btn" onClick={onContinue}>Continue</button>
      </> : <form className="auth-form" onSubmit={event => void submit(event)}>
        {action === 'forgot' && <label className="field">Account email
          <input type="email" autoComplete="username" required maxLength={254}
            value={email} onChange={event => setEmail(event.target.value)} />
        </label>}
        {usePassword && <>
          <label className="field">{needsPassword ? 'Create a password' : 'New password'}
            <input type="password" required minLength={15} maxLength={128} autoComplete="new-password"
              value={password} onChange={event => setPassword(event.target.value)} />
            <small>Use at least 15 characters.</small>
          </label>
          <label className="field">Confirm password
            <input type="password" required minLength={15} maxLength={128} autoComplete="new-password"
              value={confirm} onChange={event => setConfirm(event.target.value)} />
          </label>
        </>}
        {missingToken && <div className="notice">Open the original link from your email.</div>}
        {error && <div className="alert" role="alert"><Icon name="alert" />{error}</div>}
        <button type="submit" className="btn block" disabled={busy || missingToken}>{busy ? 'Working…'
          : action === 'forgot' ? 'Send recovery link' : action === 'reset' ? 'Save new password' : 'Accept invitation'}</button>
        <a href={authHref('login', next)}>Back to sign in</a>
      </form>}
    </section>
  </main>;
}
