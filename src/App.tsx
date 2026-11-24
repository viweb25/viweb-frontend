import { useEffect, useState } from 'react';

import { useSession } from './context/SessionContext';
import { WorkspaceIcon } from './WorkspaceIcon';
import { InspectionDemo } from './InspectionDemo';
import { TestModels } from './TestModels';
import { ModelWorkflow } from './ModelWorkflow';
import { useWorkspacePreferences } from './context/WorkspacePreferences';
import { loadCatalogue, type Template } from './services/api/catalogue';
import { loadHealth } from './services/api/health';
import { type InspectionResult } from './services/api/inspection';

const pages = {
  overview: { name: 'Home', description: '' },
  inspection: { name: 'Sample inspection', description: 'Check a photo or camera feed with the built-in model.' },
  models: { name: 'Models', description: '' },
  test: { name: 'Models', description: '' },
  training: { name: 'Example photos', description: 'Save photos that show acceptable parts and common issues.' },
  catalogue: { name: 'Inspection types', description: 'See which kinds of checks are available or planned.' },
  preferences: { name: 'Settings', description: 'Manage this browser’s workspace preferences and your sign-in.' },
} as const;

type Page = keyof typeof pages;
const tasks = [
  { page: 'inspection', title: 'Sample inspection', detail: 'Try a part check with the built-in model. Start with a photo or camera.', link: 'Try the sample' },
  { page: 'models', title: 'My models', detail: 'Train a model with your own photos or test a model you’ve already trained.', link: 'Open models' },
] as const;

type Activity = InspectionResult & { id: number; time: Date };

function currentLocation() {
  const [path, selection = ''] = window.location.hash.slice(1).split('?');
  const page = Object.hasOwn(pages, path) ? path as Page : 'overview';
  return { page, selection };
}

export function App() {
  const [{ page, selection }, setLocation] = useState(currentLocation);
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
    const handleNavigation = () => setLocation(currentLocation());
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

  const inModels = page === 'models' || page === 'test';
  const mode = page === 'inspection' ? 'inspect' : page === 'training' ? 'training' : null;
  const connectionLabel = { checking: 'Connecting…', online: 'Service online', unavailable: 'Service offline' };

  return <div className="workspace-shell">
    <header className="workspace-header">
      <div className="workspace-header-inner">
        <a className="brand" href="#overview"><span className="brand-tile"><WorkspaceIcon name="brand" /></span> VI WebSync</a>
        <div className="workspace-header-tools">
          <button type="button" className="connection" onClick={() => setRefresh(value => value + 1)}
            title="Check service connection">
            <span className={`status-dot ${connection}`} aria-hidden="true" />
            {connectionLabel[connection]}
          </button>
          <details key={page} className="workspace-menu">
            <summary><WorkspaceIcon name="preferences" /> <span>Workspace</span></summary>
            <div className="workspace-menu-links">
              <strong title={workspace}>{workspace}</strong>
              <a href="#training">Example photos</a>
              <a href="#catalogue">Inspection types</a>
              <a href="#preferences">Account and settings</a>
            </div>
          </details>
        </div>
      </div>
      <nav className="workspace-tabs" aria-label="Main tasks">
        <a href="#overview" aria-current={page === 'overview' ? 'page' : undefined}>Home</a>
        {tasks.map(task => <a key={task.page} href={`#${task.page}`}
          aria-current={(task.page === 'models' ? inModels : page === task.page) ? 'page' : undefined}>
          {task.page === 'models' ? 'Models' : task.title}</a>)}
      </nav>
    </header>

    <main className="workspace-main">
      <div className="page-heading">
        <div>
          <h1>{page === 'overview' ? 'What would you like to do?' : pages[page].name}</h1>
          {pages[page].description && <p>{pages[page].description}</p>}
        </div>
      </div>
      {page === 'overview' && <>
        <div className="task-grid">
          {tasks.map(task => <a key={task.page} className="panel task-card" href={`#${task.page}`}>
            <span className="task-icon"><WorkspaceIcon name={task.page} /></span>
            <h2>{task.title}</h2>
            <p>{task.detail}</p>
            <span className="task-link">{task.link}<WorkspaceIcon name="arrow" /></span>
          </a>)}
        </div>

          {activity.length > 0 && <section className="panel activity">
            <div className="section-heading"><div><h2>Recent inspections</h2><p>Current browser session</p></div></div>
            <div className="table-scroll">
              <table><thead><tr><th>Time</th><th>Result</th><th>Reason</th></tr></thead>
                <tbody>{activity.slice(0, 10).map(item => <tr key={item.id}>
                  <td>{item.time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</td>
                  <td><span className={`badge ${item.decision.toLowerCase()}`}>{item.decision}</span></td>
                  <td>{item.reason}</td>
                </tr>)}</tbody>
              </table>
            </div>
          </section>}
        </>}

        {inModels && <div className="models-area">
          <nav className="model-tabs" aria-label="Model workflow">
            <a href="#models" aria-current={page === 'models' ? 'page' : undefined}>
              <WorkspaceIcon name="models" /> Train a model
            </a>
            <a href="#test" aria-current={page === 'test' ? 'page' : undefined}>
              <WorkspaceIcon name="test" /> Test a model
            </a>
          </nav>
          <div hidden={page !== 'models'}>
            <ModelWorkflow />
          </div>
          {page === 'test' && <TestModels key={selection} selection={selection} />}
        </div>}
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
  </div>;
}
