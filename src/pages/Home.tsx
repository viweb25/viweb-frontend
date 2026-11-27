import { useEffect, useState } from 'react';

import { useWorkspace } from '../context/WorkspaceContext';
import { listPrograms, listRuns, type InspectionRun, type ProgramSummary } from '../services/api/inspectionPrograms';
import { listTrainingDatasets, type ProjectSummary } from '../services/api/trainingDatasets';
import { Icon, type IconName } from '../ui/Icon';
import { LabelExample } from '../ui/LabelExample';
import { ErrorBox, Loading, errorText, timeAgo } from '../ui/common';
import { useModules } from './detection/AppShell';
import { DecisionBadge, REVIEW_LABEL } from './detection/inspectionUi';

const ACTIONS: { icon: IconName; title: string; detail: string; href: string }[] = [
  { icon: 'layers', title: 'Build a model', detail: 'Add photos, label what matters, and train.', href: '/projects' },
  { icon: 'camera', title: 'Run an inspection', detail: 'Use a published program to check a photo.', href: '/operator' },
  { icon: 'flag', title: 'Review results', detail: 'Check flagged results and record what you see.', href: '/results' },
];

type Overview = { projects: ProjectSummary[]; programs: ProgramSummary[]; recent: InspectionRun[] };

export function Home() {
  const { org } = useWorkspace();
  const modules = useModules();
  const orgId = org!.org_id;
  const [data, setData] = useState<Overview | null>(null);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setError('');
    Promise.all([
      listTrainingDatasets(orgId, controller.signal),
      listPrograms(orgId, controller.signal),
      listRuns(orgId, { limit: 4 }, controller.signal),
    ]).then(([projects, programs, recent]) => {
      if (!controller.signal.aborted) setData({ projects, programs, recent });
    }).catch(cause => {
      if (!controller.signal.aborted) setError(errorText(cause, 'Could not load the workspace overview.'));
    });
    return () => controller.abort();
  }, [orgId, attempt]);

  return <main className="page workspace-page overview">
    <header className="workspace-banner">
      <div>
        <p className="workspace-context"><Icon name="building" /> {org!.name}</p>
        <h1>Workspace overview</h1>
        <p>Build models, run inspections, and review results from one place.</p>
        <div className="row"><a className="btn dark" href="/projects">Open projects <Icon name="arrow" /></a>
          <a className="btn ghost" href="/guide">Getting started</a></div>
      </div>
      {data && <dl className="overview-totals">
        <div><dt>Projects</dt><dd>{data.projects.length}</dd></div>
        <div><dt>Models trained</dt><dd>{data.projects.reduce((total, project) => total + project.model_count, 0)}</dd></div>
        <div><dt>Live programs</dt><dd>{data.programs.filter(program => program.published_revision !== null).length}</dd></div>
      </dl>}
    </header>

    <nav className="workspace-actions" aria-label="Workspace actions">
      {ACTIONS.map(action => <a className="card workspace-action" key={action.href} href={action.href}>
        <span className="workspace-icon"><Icon name={action.icon} /></span>
        <div><strong>{action.title}</strong><p>{action.detail}</p></div>
        <Icon name="arrow" />
      </a>)}
    </nav>

    <div className="workspace-columns">
      <section className="card workspace-panel">
        <div className="row"><h2 className="spacer">Latest inspections</h2><a href="/results" className="btn ghost small">View results <Icon name="arrow" /></a></div>
        {error ? <ErrorBox message={error} onRetry={() => setAttempt(value => value + 1)} />
          : !data ? <Loading label="Loading inspections…" />
          : data.recent.length ? <ul className="workspace-list overview-runs">
            {data.recent.map(run => <li key={run.id}><a href={`/results/${run.id}`}>
              <span className="spacer"><strong>{run.program_name}</strong>
                <small>{run.created_at && `${timeAgo(run.created_at)} · `}{REVIEW_LABEL[run.review_status]}</small></span>
              <DecisionBadge decision={run.decision} /><Icon name="chevron" />
            </a></li>)}
          </ul> : <p className="muted">Results will appear here after your first inspection.</p>}
      </section>
      <LabelExample />
    </div>

    <details className="card workspace-panel">
      <summary>More inspection tools</summary>
      <ul className="workspace-list">
        {modules.filter(module => module.status !== 'available').map(module => <li key={module.key}>
          <a href={`/modules/${module.key}`} className="spacer">{module.name}</a><span className="small muted">Coming soon</span>
        </li>)}
      </ul>
    </details>
  </main>;
}
