import { navigate } from '../ui/navigation';
import { useEffect, useMemo, useState, type FormEvent } from 'react';

import { useWorkspace } from '../context/WorkspaceContext';
import {
  deleteTrainingDataset, listTrainingDatasets, saveTrainingDataset, type ProjectSummary,
} from '../services/api/trainingDatasets';
import { LABEL_EXAMPLE } from '../ui/inspectionExample';
import { Icon } from '../ui/Icon';
import {
  ErrorBox, Modal, classColor, errorText, projectHref, timeAgo, useToast, type Step,
} from '../ui/common';

type Status = { label: string; step: Step; tone: 'plain' | 'live' | 'dark' | 'soft' };

function projectStatus(project: ProjectSummary): Status {
  if (project.latest_status === 'queued' || project.latest_status === 'running') return { label: 'Training now', step: 'train', tone: 'live' };
  if (!project.classes.length) return { label: 'Name what to find', step: 'detect', tone: 'plain' };
  if (!project.photo_count) return { label: 'Add photos', step: 'upload', tone: 'soft' };
  if (project.labeled_count < project.photo_count || project.labeled_count < 4) return { label: 'Marking', step: 'label', tone: 'soft' };
  if (!project.model_count) return { label: 'Ready to train', step: 'train', tone: 'soft' };
  return { label: 'Model ready', step: 'test', tone: 'dark' };
}

const NEXT: Record<Step, string> = {
  upload: 'Add photos', detect: 'Say what to find', label: 'Mark photos', train: 'Train model', test: 'Test model', use: 'Use model',
};

export function Dashboard() {
  const { org, canEdit } = useWorkspace();
  const orgId = org!.org_id;
  const [projects, setProjects] = useState<ProjectSummary[] | null>(null);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<ProjectSummary | null>(null);
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<'recent' | 'name' | 'labels'>('recent');
  const [layout, setLayout] = useState<'cards' | 'list'>('cards');
  const [filter, setFilter] = useState<'all' | 'progress' | 'ready'>('all');
  const anyTraining = projects?.some(project => projectStatus(project).tone === 'live');

  useEffect(() => {
    const controller = new AbortController();
    setError('');
    listTrainingDatasets(orgId, controller.signal).then(setProjects).catch(cause => {
      if (!controller.signal.aborted) setError(errorText(cause, 'Could not load your projects.'));
    });
    return () => controller.abort();
  }, [orgId, attempt]);

  useEffect(() => {
    if (!anyTraining) return;
    const timer = setInterval(() => setAttempt(value => value + 1), 10_000);
    return () => clearInterval(timer);
  }, [anyTraining]);

  const visible = useMemo(() => (projects ?? []).filter(project => {
    const text = `${project.part_name} ${project.classes.join(' ')}`.toLowerCase();
    if (query && !text.includes(query.toLowerCase())) return false;
    const ready = project.model_count > 0;
    return filter === 'all' || (filter === 'ready' ? ready : !ready);
  }).sort((left, right) => sort === 'name' ? left.part_name.localeCompare(right.part_name)
    : sort === 'labels' ? right.labeled_count - left.labeled_count
    : right.updated_at.localeCompare(left.updated_at)), [projects, query, filter, sort]);

  const totals = useMemo(() => ({
    projects: projects?.length ?? 0,
    photos: projects?.reduce((sum, project) => sum + project.labeled_count, 0) ?? 0,
    models: projects?.reduce((sum, project) => sum + project.model_count, 0) ?? 0,
    training: projects?.filter(project => projectStatus(project).tone === 'live').length ?? 0,
  }), [projects]);

  const current = projects?.find(project => project.latest_status === 'queued' || project.latest_status === 'running') ?? projects?.[0];

  return <main className="page workspace-page">
    <header className="page-head">
      <div><h1>Projects</h1><p>Prepare photos, train models, and pick up where you left off.</p></div>
      {canEdit && <button type="button" className="btn dark" onClick={() => setCreating(true)}><Icon name="plus" /> New project</button>}
    </header>

    {projects && <dl className="project-kpis">
      <div><Icon name="grid" /><dt>Projects</dt><dd>{totals.projects}</dd></div>
      <div><Icon name="image" /><dt>Labeled photos</dt><dd>{totals.photos}</dd></div>
      <div><Icon name="layers" /><dt>Trained models</dt><dd>{totals.models}</dd></div>
      <div><Icon name="cpu" /><dt>Training now</dt><dd>{totals.training}</dd></div>
    </dl>}

    {current && <section className="project-resume">
      <span className="workspace-icon"><Icon name={anyTraining ? 'cpu' : 'layers'} /></span>
      <div className="spacer"><p className="small muted">{anyTraining ? 'Active training' : 'Last updated project'}</p>
        <h2>{current.part_name}</h2></div>
      <a className="btn ghost" href={projectHref(orgId, current.id, projectStatus(current).step)}>
        {NEXT[projectStatus(current).step]} <Icon name="arrow" />
      </a>
    </section>}

    <section className="stack">
      <div className="page-head">
        <h2>Project library</h2>
        <div className="toolbar">
          <label className="input-icon"><Icon name="zoomIn" /><span className="sr-only">Search projects</span>
            <input className="input" type="search" placeholder="Search projects or classes" value={query}
              onChange={event => setQuery(event.target.value)} /></label>
          <div className="seg" role="group" aria-label="Filter projects">
            {([['all', 'All'], ['progress', 'In progress'], ['ready', 'Model ready']] as const).map(([value, label]) =>
              <button key={value} type="button" aria-pressed={filter === value} onClick={() => setFilter(value)}>{label}</button>)}
          </div>
          <label className="sr-only" htmlFor="project-sort">Sort projects</label>
          <select id="project-sort" className="input project-sort" value={sort} onChange={event => setSort(event.target.value as typeof sort)}>
            <option value="recent">Recently updated</option><option value="name">Name</option><option value="labels">Most labeled photos</option>
          </select>
          <div className="seg" role="group" aria-label="Project layout">
            <button type="button" aria-pressed={layout === 'cards'} onClick={() => setLayout('cards')}>Cards</button>
            <button type="button" aria-pressed={layout === 'list'} onClick={() => setLayout('list')}>List</button>
          </div>
        </div>
      </div>

      {error && <ErrorBox message={error} onRetry={() => setAttempt(value => value + 1)} />}
      {!projects && !error && <div className="projects">{[0, 1, 2].map(index => <div key={index} className="skeleton" style={{ height: 220 }} />)}</div>}
      {projects && projects.length === 0 && <div className="empty">
        <span className="bubble"><Icon name="layers" /></span>
        <h2>Train your first model</h2>
        <p className="muted" style={{ maxWidth: '46ch' }}>Start with your own photos and label what the model should learn to find.</p>
        {canEdit ? <button type="button" className="btn" onClick={() => setCreating(true)}><Icon name="plus" /> Train a model</button>
          : <p className="muted">You have view-only access in this workspace.</p>}
      </div>}
      {projects && projects.length > 0 && <div className={`projects project-library ${layout}`}>
        {visible.map(project => <ProjectCard key={project.id} orgId={orgId} project={project}
          onDelete={canEdit ? () => setDeleting(project) : undefined} />)}
        {visible.length === 0 && <p className="muted">No projects match your search.</p>}
      </div>}
    </section>

    {creating && <CreateProject orgId={orgId} onClose={() => setCreating(false)} />}
    {deleting && <DeleteProject orgId={orgId} project={deleting} onClose={() => setDeleting(null)}
      onDeleted={() => {
        setProjects(current => current?.filter(item => item.id !== deleting.id) ?? null);
        setDeleting(null);
      }} />}
  </main>;
}

function ProjectCard({ orgId, project, onDelete }: { orgId: string; project: ProjectSummary; onDelete?: () => void }) {
  const status = projectStatus(project);
  const labeled = project.photo_count ? Math.round(100 * project.labeled_count / project.photo_count) : 0;
  return <div style={{ position: 'relative' }}>
    <a className="project" href={projectHref(orgId, project.id, status.step)}>
      <div className="project-top">
        <span className="project-icon"><Icon name="layers" /></span>
        <div style={{ minWidth: 0, flex: 1, paddingRight: onDelete ? '2rem' : 0 }}>
          <h3 title={project.part_name}>{project.part_name}</h3>
          <div className="project-meta">Updated {timeAgo(project.updated_at)}</div>
        </div>
      </div>
      <div className="classes">
        {project.classes.slice(0, 4).map((label, index) => <span key={label} className="chip plain">
          <span className="swatch" style={{ background: classColor(index), width: 9, height: 9 }} />{label}
        </span>)}
        {project.classes.length > 4 && <span className="chip plain">+{project.classes.length - 4}</span>}
        {!project.classes.length && <span className="muted small">No classes yet</span>}
      </div>
      <div className="progress-line">
        <div><span>{project.labeled_count} of {project.photo_count} photos labeled</span><span>{project.model_count} {project.model_count === 1 ? 'model' : 'models'}</span></div>
        <div className="bar"><span style={{ width: `${labeled}%` }} /></div>
      </div>
      <div className="project-foot">
        <span className={`chip ${status.tone === 'dark' ? 'dark' : status.tone === 'live' ? 'live' : status.tone === 'plain' ? 'plain' : ''}`}>
          {status.tone === 'live' && <span className="dot" />}{status.label}
        </span>
        <span className="next">{NEXT[status.step]} <Icon name="arrow" /></span>
      </div>
    </a>
    {onDelete && <button type="button" className="icon-btn menu-trigger" style={{ position: 'absolute', top: '.8rem', right: '.8rem' }}
      aria-label={`Archive ${project.part_name}`} title="Archive project" onClick={onDelete}><Icon name="trash" /></button>}
  </div>;
}

export function CreateProject({ orgId, onClose }: { orgId: string; onClose: () => void }) {
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!name.trim() || busy) return;
    setBusy(true);
    setError('');
    try {
      const id = crypto.randomUUID();
      await saveTrainingDataset(orgId, {
        id, revision: 0, part_name: name.trim(), classes: [], class_info: {}, inspection_note: '', photos: [],
      });
      navigate(projectHref(orgId, id, 'detect'));
    } catch (cause) {
      setError(errorText(cause, 'Could not start the training project.'));
      setBusy(false);
    }
  }

  return <Modal title="New project" onClose={onClose}
    description="Name your project, upload your photos, then mark what the model should learn to find."
    footer={<>
      <button type="button" className="btn ghost" onClick={onClose} disabled={busy}>Cancel</button>
      <button type="submit" form="start-training-project" className="btn" disabled={busy || !name.trim()}>
        {busy ? 'Opening project…' : <>Continue to set up <Icon name="arrow" /></>}
      </button>
    </>}>
    <form id="start-training-project" className="stack" onSubmit={create}>
      <label className="field">Project name
        <input maxLength={80} value={name} placeholder={LABEL_EXAMPLE.project} required disabled={busy}
          onChange={event => setName(event.target.value)} />
      </label>
      {error && <ErrorBox message={error} />}
    </form>
  </Modal>;
}

function DeleteProject({ orgId, project, onClose, onDeleted }: {
  orgId: string;
  project: ProjectSummary;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const toast = useToast();
  return <Modal title={`Archive “${project.part_name}”?`} onClose={onClose}
    description="This hides the project and its inspection programs from active lists. Photos, labels, models, and inspection history are retained."
    footer={<>
      <button type="button" className="btn ghost" onClick={onClose} disabled={busy}>Keep project</button>
      <button type="button" className="btn dark" disabled={busy} onClick={async () => {
        setBusy(true);
        setError('');
        try {
          await deleteTrainingDataset(orgId, project.id);
          toast('Project archived');
          onDeleted();
        } catch (cause) {
          setError(errorText(cause, 'Could not archive the project.'));
          setBusy(false);
        }
      }}><Icon name="trash" /> {busy ? 'Archiving…' : 'Archive project'}</button>
    </>}>
    <p>{project.photo_count} photos and {project.model_count} trained {project.model_count === 1 ? 'model' : 'models'} will be retained.</p>
    {error && <ErrorBox message={error} />}
  </Modal>;
}
