import { useEffect, useState } from 'react';

import { useSession } from '../context/SessionContext';
import { useWorkspace } from '../context/WorkspaceContext';
import { listWorkspaceMembers, type WorkspaceMember } from '../services/api/auth';
import { Icon } from '../ui/Icon';
import { ErrorBox, Loading, errorText, initials } from '../ui/common';

const ROLE_TEXT: Record<string, string> = {
  owner: 'Full control of the workspace',
  admin: 'Manage projects and people',
  operator: 'Create projects, label and train',
  viewer: 'View projects and results',
};

export function Team() {
  const { user, logout } = useSession();
  const { org, organisations, select } = useWorkspace();
  const [members, setMembers] = useState<WorkspaceMember[] | null>(null);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [signingOut, setSigningOut] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    setError('');
    setMembers(null);
    listWorkspaceMembers(org!.org_id, controller.signal).then(setMembers).catch(cause => {
      if (!controller.signal.aborted) setError(errorText(cause, 'Could not load team members.'));
    });
    return () => controller.abort();
  }, [org, attempt]);

  return <main className="page narrow">
    <header className="page-head">
      <div><span className="eyebrow">Workspace</span><h1 style={{ marginTop: '.3rem' }}>{org!.name}</h1>
        <p>Your role: <strong>{org!.role}</strong> · {ROLE_TEXT[org!.role] ?? ''}</p></div>
    </header>

    <section className="card">
      <div className="card-head"><h2>Team members</h2>{members && <span className="chip plain">{members.length}</span>}</div>
      <div className="card-body">
        {error && <ErrorBox message={error} onRetry={() => setAttempt(value => value + 1)} />}
        {!members && !error && <Loading label="Loading team…" />}
        {members && <ul className="members">
          {members.map(member => <li key={member.id}>
            <span className="avatar soft">{initials(member.name)}</span>
            <span><strong>{member.name}</strong>{member.id === user.id && <span className="muted small"> (you)</span>}
              <br /><span className="muted small">{ROLE_TEXT[member.role] ?? member.role}</span></span>
            <span className="spacer" />
            <span className={`chip ${member.role === 'owner' ? 'dark' : 'plain'}`}>{member.role}</span>
          </li>)}
        </ul>}
        <p className="small muted" style={{ marginTop: '1rem' }}><Icon name="info" /> Inviting teammates from the app is not available yet. Your server administrator can add people to this workspace.</p>
      </div>
    </section>

    {organisations.length > 1 && <section className="card">
      <div className="card-head"><h2>Your workspaces</h2></div>
      <div className="card-body"><ul className="members">
        {organisations.map(item => <li key={item.org_id}>
          <span className="avatar soft">{initials(item.name)}</span>
          <span><strong>{item.name}</strong><br /><span className="muted small">{item.role}</span></span>
          <span className="spacer" />
          {item.org_id === org!.org_id ? <span className="chip dark">Current</span>
            : <button type="button" className="btn ghost small" onClick={() => select(item.org_id)}>Switch</button>}
        </li>)}
      </ul></div>
    </section>}

    <section className="card">
      <div className="card-head"><h2>Your account</h2></div>
      <div className="card-body row">
        <span className="avatar">{initials(user.display_name || user.email || '?')}</span>
        <span className="spacer"><strong>{user.display_name || 'Signed in'}</strong><br /><span className="muted small">{user.email}</span></span>
        <button type="button" className="btn ghost" disabled={signingOut} onClick={async () => {
          setSigningOut(true);
          try { await logout(); } catch { setSigningOut(false); }
        }}><Icon name="logout" /> {signingOut ? 'Signing out…' : 'Sign out'}</button>
      </div>
    </section>
  </main>;
}
