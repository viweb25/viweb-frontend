import { useEffect, useState } from 'react';

import { useSession } from './context/SessionContext';
import { InspectionDemo } from './InspectionDemo';
import { ModelWorkflow } from './ModelWorkflow';
import { useWorkspacePreferences } from './context/WorkspacePreferences';
import { loadCatalogue, type Template } from './services/api/catalogue';
import { loadHealth } from './services/api/health';
import { type InspectionResult } from './services/api/inspection';

const pages = {
  overview: { name: 'Overview', icon: '▦', description: 'Start here to check parts and review this session’s results.' },
  inspection: { name: 'Check parts', icon: '◎', description: 'Connect a camera or choose a photo. Then tell us what to check.' },
  models: { name: 'Train a model', icon: '◇', description: 'Use labeled photos from your own production line.' },
  training: { name: 'Example photos', icon: '▤', description: 'Save photos that show acceptable parts and common issues.' },
  catalogue: { name: 'Inspection types', icon: '▧', description: 'See which kinds of checks are available or planned.' },
  preferences: { name: 'Settings', icon: '⚙', description: 'Manage this browser’s workspace preferences and your sign-in.' },
} as const;

type Page = keyof typeof pages;
const menuGroups: { name: string; items: Page[] }[] = [
  { name: 'Daily work', items: ['overview', 'inspection', 'training'] },
  { name: 'Workspace setup', items: ['models', 'catalogue', 'preferences'] },
];

type Activity = InspectionResult & { id: number; time: Date };

function currentPage(): Page {
  const hash = window.location.hash.slice(1);
  return Object.hasOwn(pages, hash) ? (hash as Page) : 'overview';
}

export function App() {
  const [page, setPage] = useState(currentPage);
  const [templates, setTemplates] = useState<Template[] | null>(null);
  const [catalogueError, setCatalogueError] = useState(false);
  const [connection, setConnection] = useState<'checking' | 'online' | 'unavailable'>('checking');
  const [refresh, setRefresh] = useState(0);
  const [activity, setActivity] = useState<Activity[]>([]);
  const { preferences, update } = useWorkspacePreferences();
  const { user, logout } = useSession();
  const [signOutError, setSignOutError] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const workspace = preferences.workspaceName.trim() || user.organisations[0]?.name || 'Workspace';

  async function handleLogout() {
    setSignOutError(false);
    setSigningOut(true);
    try {
      await logout();
    } catch {
      setSignOutError(true);
      setSigningOut(false);
    }
  }

  useEffect(() => {
    const handleNavigation = () => setPage(currentPage());
    window.addEventListener('hashchange', handleNavigation);
    return () => window.removeEventListener('hashchange', handleNavigation);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const { signal } = controller;
    setConnection('checking');
    setCatalogueError(false);
    loadHealth(signal).then(health => {
      if (!signal.aborted) setConnection(health.status === 'ok' ? 'online' : 'unavailable');
    }).catch(() => { if (!signal.aborted) setConnection('unavailable'); });
    loadCatalogue(signal).then(items => {
      if (!signal.aborted) setTemplates(items);
    }).catch(() => { if (!signal.aborted) setCatalogueError(true); });
    return () => controller.abort();
  }, [refresh]);

  function recordResult(result: InspectionResult) {
    setActivity(previous => [{ ...result, id: previous.length, time: new Date() }, ...previous]);
  }

  const mode = page === 'inspection' ? 'inspect' : page === 'training' ? 'training' : null;
  const connectionLabel = { checking: 'Connecting…', online: 'Service online', unavailable: 'Service offline' };

  return <div className="shell">
    <aside className="sidebar">
      <a className="brand" href="#overview"><span className="brand-tile" aria-hidden="true">V</span> VI WebSync</a>
      <nav aria-label="Workspace navigation">
        {menuGroups.map(group => <div className="navigation-group" key={group.name}>
          <span className="navigation-heading">{group.name}</span>
          {group.items.map(key => <a key={key} href={`#${key}`} aria-current={page === key ? 'page' : undefined}>
            <span className="nav-icon" aria-hidden="true">{pages[key].icon}</span>{pages[key].name}
          </a>)}
        </div>)}
      </nav>
      <div className="workspace-identity">
        <span className="workspace-tile" aria-hidden="true">{workspace.slice(0, 1).toUpperCase()}</span>
        <span className="workspace-name">{workspace}</span>
      </div>
    </aside>

    <div className="shell-body">
      <header className="topbar">
        <div className="breadcrumb"><span title={workspace}>{workspace}</span><span aria-hidden="true">/</span><strong>{pages[page].name}</strong></div>
        <button type="button" className="connection" onClick={() => setRefresh(value => value + 1)}
          title="Check service connection">
          <span className={`status-dot ${connection}`} aria-hidden="true" />
          {connectionLabel[connection]}
        </button>
      </header>

      <main>
        <div className="page-heading">
          <div><h1>{pages[page].name}</h1><p>{pages[page].description}</p></div>
        </div>
        {page === 'overview' && <>
          <div className="card-grid">
            <section className="panel">
              <h2>Try a demo inspection</h2>
              <p>Check a photo using the existing YOLO model.</p>
              <a href="#inspection">Try demo inspection</a>
            </section>

            <section className="panel">
              <h2>Train your own model</h2>
              <p>Learn how to prepare labeled photos of your own parts.</p>
              <a href="#models">Open the training guide</a>
            </section>
          </div>

          <section className="panel activity">
            <div className="section-heading"><div><h2>Recent inspections</h2><p>Current browser session</p></div></div>
            {activity.length ? <div className="table-scroll">
              <table><thead><tr><th>Time</th><th>Result</th><th>Reason</th></tr></thead>
                <tbody>{activity.slice(0, 10).map(item => <tr key={item.id}>
                  <td>{item.time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</td>
                  <td><span className={`badge ${item.decision.toLowerCase()}`}>{item.decision}</span></td>
                  <td>{item.reason}</td>
                </tr>)}</tbody>
              </table>
            </div> : <div className="empty">
              <span className="empty-icon" aria-hidden="true">◎</span>
              <strong>No inspections yet</strong>
              <a href="#inspection">Run an inspection <span aria-hidden="true">→</span></a>
            </div>}
          </section>
        </>}

        {page === 'models' && <ModelWorkflow />}
        {page === 'training' && <p className="notice">These photos record pass or fail examples. To train a part detector, <a href="#models">label each part with a bounding box</a>.</p>}
        <InspectionDemo mode={mode} onResult={recordResult} />

        {page === 'catalogue' && <>
          {catalogueError && <p role="status" className="notice">Could not refresh the catalogue. <button className="secondary" onClick={() => setRefresh(value => value + 1)}>Retry</button></p>}
          {!templates && !catalogueError && <p role="status" className="muted">Loading catalogue…</p>}
          {templates?.length === 0 && <p className="muted">No templates available.</p>}
          <div className="card-grid">{templates?.map(item => <article className="panel" key={item.id}>
            <h2>{item.name}</h2><p className="muted">{item.stage.startsWith('planned') ? 'Planned' : item.stage}</p>
          </article>)}</div>
        </>}

        {page === 'preferences' && <section className="panel preferences">
          <h2>Signed-in account</h2>
          <p>{user.display_name || user.email || 'Company account'}</p>
          {user.organisations.map(organisation =>
            <p className="muted" key={organisation.org_id}>{organisation.name} · {organisation.role}</p>)}
          <button className="secondary" disabled={signingOut} onClick={handleLogout}>
            {signingOut ? 'Signing out…' : 'Sign out'}
          </button>
          {signOutError && <p role="status" className="notice">Could not sign out. Please try again.</p>}
          <label className="demo-field">Workspace name
            <input value={preferences.workspaceName} maxLength={80} placeholder="Enter your workspace or company name"
              onChange={event => update({ workspaceName: event.target.value })} />
          </label>
          <label className="demo-field">Default acceptance rule
            <textarea value={preferences.acceptanceRule} rows={4} maxLength={400}
              placeholder="Describe the features an acceptable part must have"
              onChange={event => update({ acceptanceRule: event.target.value })} />
          </label>
        </section>}
      </main>
    </div>
  </div>;
}
