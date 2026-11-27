import { useEffect, useState, type ReactNode } from 'react';

import { useWorkspace } from '../../context/WorkspaceContext';
import { listPrograms, type ProgramSummary } from '../../services/api/inspectionPrograms';
import { listTrainingDatasets, type ProjectSummary } from '../../services/api/trainingDatasets';
import { LabelExample } from '../../ui/LabelExample';
import { Icon, type IconName } from '../../ui/Icon';
import { projectHref, type Step } from '../../ui/common';
import { CreateProject } from '../Dashboard';
import { MIN_PHOTOS_TO_TRAIN } from '../project/useProject';

type Data = { projects: ProjectSummary[]; programs: ProgramSummary[] };

/** The six steps, each one picture and two words. `done` reads the workspace's real progress. */
const FLOW: { key: string; art: ReactNode; title: string; hint: string; step?: Step; done: (p: ProjectSummary | undefined, d: Data) => boolean }[] = [
  { key: 'name', art: <Icon name="tag" />, title: 'Name it', hint: 'What to find', step: 'detect',
    done: p => (p?.classes.length ?? 0) > 0 },
  { key: 'rule', art: <span className="gs-pair"><Icon name="check" /><Icon name="close" /></span>, title: 'Good / Bad', hint: 'Pass or fail', step: 'detect',
    done: p => Object.keys(p?.class_info ?? {}).length > 0 },
  { key: 'photos', art: <Icon name="camera" />, title: 'Photos', hint: 'Add pictures', step: 'upload',
    done: p => (p?.photo_count ?? 0) > 0 },
  { key: 'mark', art: <Icon name="box" />, title: 'Mark', hint: 'Draw boxes', step: 'label',
    done: p => (p?.labeled_count ?? 0) >= MIN_PHOTOS_TO_TRAIN },
  { key: 'train', art: <Icon name="cpu" />, title: 'Train', hint: 'One click', step: 'train',
    done: p => (p?.model_count ?? 0) > 0 },
  { key: 'check', art: <Icon name="flag" />, title: 'Check', hint: 'PASS / FAIL',
    done: (_, d) => d.programs.some(program => program.run_count > 0) },
];

const TOOLS: { icon: IconName; title: string; hint: string; href: string }[] = [
  { icon: 'grid', title: 'Projects', hint: 'Teach models', href: '/projects' },
  { icon: 'layers', title: 'Inspection programs', hint: 'Zones and rules', href: '/programs' },
  { icon: 'camera', title: 'Run inspection', hint: 'Check a board', href: '/operator' },
  { icon: 'flag', title: 'Results', hint: 'Review checks', href: '/results' },
  { icon: 'inspect', title: 'Quick check', hint: 'Try any photo', href: '/inspect' },
];

/** The project the user is most likely working on: most progress, then most recent. */
function currentProject(projects: ProjectSummary[]) {
  return [...projects].sort((a, b) =>
    b.model_count - a.model_count || b.labeled_count - a.labeled_count || b.updated_at.localeCompare(a.updated_at))[0];
}

export function GuidePage() {
  const { org, canEdit } = useWorkspace();
  const orgId = org!.org_id;
  const [data, setData] = useState<Data | null>(null);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    const abort = new AbortController();
    Promise.all([listTrainingDatasets(orgId, abort.signal), listPrograms(orgId, abort.signal)])
      .then(([projects, programs]) => setData({ projects, programs }))
      .catch(() => { if (!abort.signal.aborted) setData({ projects: [], programs: [] }); });
    return () => abort.abort();
  }, [orgId]);

  const project = data ? currentProject(data.projects) : undefined;
  const states = data ? FLOW.map(item => item.done(project, data)) : FLOW.map(() => false);
  const nextIndex = data ? states.findIndex(done => !done) : -1;
  const next = nextIndex >= 0 ? FLOW[nextIndex] : undefined;
  const continueHref = project && next
    ? next.step ? projectHref(orgId, project.id, next.step) : '/programs'
    : '/results';

  return <main className="page workspace-page">
    <header className="page-head">
      <div>
        <h1>Getting started</h1>
        <p>Turn your photos into a repeatable inspection.</p>
      </div>
    </header>

    <ol className="gs-flow" aria-label="How it works">
      {FLOW.map((item, index) => {
        const done = states[index];
        const now = index === nextIndex && Boolean(project);
        return <li key={item.key} className={`${done ? 'done' : ''}${now ? ' now' : ''}`}>
          <span className="gs-tile">
            <span className="gs-art">{item.art}</span>
            {done && <span className="gs-done" aria-label="done"><Icon name="check" /></span>}
          </span>
          <strong>{item.title}</strong>
          <small>{item.hint}</small>
        </li>;
      })}
    </ol>

    {canEdit && <div className="gs-cta">
      {!data ? <span className="btn large" aria-busy="true"><span className="spinner" /></span>
        : !project ? <button type="button" className="btn large" onClick={() => setCreating(true)}><Icon name="plus" /> Start</button>
          : <a className="btn large" href={continueHref}>
            {next ? <>Continue: {next.title}</> : <>See results</>} <Icon name="arrow" />
          </a>}
      {project && next && <span className="muted small">in “{project.part_name}”</span>}
    </div>}

    <div className="workspace-columns"><section className="gs-tools" aria-label="Tools">
      {TOOLS.map(tool => <a key={tool.href} className="gs-tool" href={tool.href}>
        <span className="gs-tool-icon"><Icon name={tool.icon} /></span>
        <span><strong>{tool.title}</strong><small>{tool.hint}</small></span>
        <Icon name="chevron" />
      </a>)}
    </section>

    <LabelExample /></div>

    {creating && canEdit && <CreateProject orgId={orgId} onClose={() => setCreating(false)} />}
  </main>;
}
