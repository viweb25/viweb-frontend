import { useEffect, useRef, useState, type ReactNode } from 'react';

import { useSession } from './context/SessionContext';
import { useWorkspace } from './context/WorkspaceContext';
import { Dashboard } from './pages/Dashboard';
import { Home } from './pages/Home';
import { Inspect } from './pages/Inspect';
import { ProjectStudio } from './pages/ProjectStudio';
import { Team } from './pages/Team';
import { AppShell, ModulePage } from './pages/detection/AppShell';
import { GuidePage } from './pages/detection/GuidePage';
import { ProgramEditor } from './pages/detection/ProgramEditor';
import { ProgramsPage } from './pages/detection/ProgramsPage';
import { ResultsPage } from './pages/detection/ResultsPage';
import { Icon, Logo } from './ui/Icon';
import { initials, useRoute, type ShellPage } from './ui/common';

const TITLES: Record<ShellPage, string> = {
  home: 'Home', projects: 'Projects', guide: 'Getting started', programs: 'Inspection programs', program: 'Inspection program',
  results: 'Results and review', inspect: 'Quick check', team: 'Workspace', module: 'Module',
};

export function App() {
  const route = useRoute();
  const { org, organisations, select } = useWorkspace();

  useEffect(() => {
    if (route.page === 'project' && route.org !== org?.org_id && organisations.some(item => item.org_id === route.org)) {
      select(route.org);
    }
  }, [route, org, organisations, select]);

  useEffect(() => {
    document.title = `${route.page === 'project' ? 'Project' : TITLES[route.page]} · Vision Studio`;
    window.scrollTo(0, 0);
  }, [route.page]);

  if (!org) return <>
    <Topbar />
    <main className="page narrow">
      <div className="empty">
        <span className="bubble"><Icon name="building" /></span>
        <h2>You are not part of a workspace yet</h2>
        <p className="muted">Ask a workspace owner to add you, or sign up again to create your own workspace.</p>
      </div>
    </main>
  </>;

  if (route.page === 'project') {
    if (route.org !== org.org_id && !organisations.some(item => item.org_id === route.org)) {
      return <>
        <Topbar />
        <main className="page narrow"><div className="empty">
          <span className="bubble"><Icon name="lock" /></span>
          <h2>This project is not in your workspaces</h2>
          <a className="btn" href="#/projects">Back to projects</a>
        </div></main>
      </>;
    }
    if (route.org !== org.org_id) return null;
    return <ProjectStudio key={`${route.org}/${route.dataset}`} orgId={route.org} datasetId={route.dataset} step={route.step} />;
  }

  return <AppShell page={route.page} moduleKey={route.page === 'module' ? route.key : undefined} orgId={org.org_id}>
    {route.page === 'home' && <Home />}
    {route.page === 'projects' && <Dashboard key={org.org_id} />}
    {route.page === 'guide' && <GuidePage />}
    {route.page === 'programs' && <ProgramsPage key={org.org_id} />}
    {route.page === 'program' && <ProgramEditor key={`${org.org_id}/${route.id}`} programId={route.id} />}
    {route.page === 'results' && <ResultsPage key={org.org_id} runId={route.run} />}
    {route.page === 'inspect' && <Inspect key={org.org_id} />}
    {route.page === 'team' && <Team key={org.org_id} />}
    {route.page === 'module' && <ModulePage moduleKey={route.key} />}
  </AppShell>;
}

export function Topbar({ children, right, compact }: { children?: ReactNode; right?: ReactNode; compact?: boolean }) {
  return <header className={`topbar${compact ? ' compact' : ''}`}>
    <div className="topbar-inner">
      <a className="brand" href="#/" aria-label="Vision Studio home"><Logo /> <span className="brand-text">Vision Studio</span></a>
      {children}
      <span className="spacer" />
      {right}
      <UserMenu />
    </div>
  </header>;
}

function UserMenu() {
  const { user, logout } = useSession();
  const { org, organisations, select } = useWorkspace();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const ref = useRef<HTMLDetailsElement>(null);
  const name = user.display_name || user.email || 'Account';

  useEffect(() => {
    const close = (event: MouseEvent) => {
      if (ref.current?.open && !ref.current.contains(event.target as Node)) ref.current.open = false;
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  return <details className="menu" ref={ref}>
    <summary aria-label="Account menu">
      <span className="avatar">{initials(name)}</span>
      <span className="small" style={{ maxWidth: '16ch', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 600 }}>
        {org?.name}
      </span>
      <Icon name="chevronDown" />
    </summary>
    <div className="menu-panel">
      <div className="who"><strong>{user.display_name || 'Signed in'}</strong><span>{user.email}</span></div>
      {organisations.length > 1 && <>
        <div className="label">Switch workspace</div>
        {organisations.map(item => <button type="button" key={item.org_id}
          className={item.org_id === org?.org_id ? 'current' : ''}
          onClick={() => {
            select(item.org_id);
            window.location.hash = '#/';
            if (ref.current) ref.current.open = false;
          }}>
          <span className="avatar soft">{initials(item.name)}</span>
          <span className="spacer">{item.name}</span>
          {item.org_id === org?.org_id && <Icon name="check" />}
        </button>)}
      </>}
      <a href="#/team" onClick={() => { if (ref.current) ref.current.open = false; }}><Icon name="team" /> Workspace and team</a>
      <button type="button" disabled={busy} onClick={async () => {
        setBusy(true);
        setError(false);
        try {
          await logout();
        } catch {
          setError(true);
          setBusy(false);
        }
      }}><Icon name="logout" /> {busy ? 'Signing out…' : 'Sign out'}</button>
      {error && <p className="small" role="alert" style={{ padding: '.4rem .7rem' }}>Could not sign out. Try again.</p>}
    </div>
  </details>;
}
