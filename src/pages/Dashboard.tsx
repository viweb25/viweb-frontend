import { useEffect, useMemo, useState, type FormEvent } from 'react';

import { useSession } from '../context/SessionContext';
import { useWorkspace } from '../context/WorkspaceContext';
import {
  deleteTrainingDataset, listTrainingDatasets, saveTrainingDataset, type ProjectSummary,
} from '../services/api/trainingDatasets';
import { Icon, type IconName } from '../ui/Icon';
import {
  ErrorBox, Modal, classColor, errorText, projectHref, timeAgo, useToast, type Step,
} from '../ui/common';

export const TEMPLATES: { name: string; icon: IconName; classes: string[]; hint: string }[] = [
  { name: 'Custom', icon: 'plus', classes: [], hint: 'Start from scratch' },
  { name: 'Safety gear', icon: 'user', classes: ['Helmet', 'Vest', 'Person', 'Gloves'], hint: 'PPE on site' },
  { name: 'Manufacturing', icon: 'cpu', classes: ['Scratch', 'Dent', 'Screw'], hint: 'Defects and parts' },
  { name: 'Bottling', icon: 'target', classes: ['Bottle', 'Cap', 'Label'], hint: 'Caps and labels' },
  { name: 'Retail', icon: 'grid', classes: ['Product', 'Shelf label', 'Empty slot'], hint: 'Shelf checks' },
  { name: 'Logistics', icon: 'box', classes: ['Box', 'Pallet', 'Barcode'], hint: 'Packages' },
  { name: 'Agriculture', icon: 'sparkle', classes: ['Healthy leaf', 'Pest damage'], hint: 'Crop health' },
];

type Status = { label: string; step: Step; tone: 'plain' | 'live' | 'dark' | 'soft' };

function projectStatus(project: ProjectSummary): Status {
  if (project.latest_status === 'queued' || project.latest_status === 'running') return { label: 'Training now', step: 'train', tone: 'live' };
  if (!project.photo_count) return { label: 'Add photos', step: 'upload', tone: 'plain' };
  if (project.labeled_count < project.photo_count || project.labeled_count < 4) return { label: 'Labeling', step: 'label', tone: 'soft' };
  if (!project.model_count) return { label: 'Ready to train', step: 'train', tone: 'soft' };
  return { label: 'Model ready', step: 'test', tone: 'dark' };
}

const NEXT: Record<Step, string> = {
  upload: 'Upload photos', label: 'Continue labeling', train: 'Train model', test: 'Test model', use: 'Use model',
};

export function Dashboard() {
  const { user } = useSession();
  const { org, canEdit } = useWorkspace();
  const orgId = org!.org_id;
  const [projects, setProjects] = useState<ProjectSummary[] | null>(null);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<ProjectSummary | null>(null);
  const [query, setQuery] = useState('');
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
  }), [projects, query, filter]);

  const totals = useMemo(() => ({
    projects: projects?.length ?? 0,
    photos: projects?.reduce((sum, project) => sum + project.labeled_count, 0) ?? 0,
    models: projects?.reduce((sum, project) => sum + project.model_count, 0) ?? 0,
    training: projects?.filter(project => projectStatus(project).tone === 'live').length ?? 0,
  }), [projects]);

  const firstName = (user.display_name || '').split(' ')[0];

  return <main className="page">
    <section className="hero">
      <div className="hero-main">
        <div>
          <span className="eyebrow">{org!.name}</span>
          <h1 style={{ marginTop: '.4rem' }}>{firstName ? `Welcome back, ${firstName}` : 'Welcome to Vision Studio'}</h1>
          <p style={{ marginTop: '.6rem' }}>Build a detection model in five steps. Every project walks you through it, and you can pause and come back at any time.</p>
        </div>
        <div className="flow" aria-label="How a project works">
          {([['upload', 'Upload'], ['box', 'Label'], ['cpu', 'Train'], ['inspect', 'Test'], ['rocket', 'Use']] as const).map(([icon, label]) =>
            <div key={label}><Icon name={icon} />{label}</div>)}
        </div>
        {canEdit && <div><button type="button" className="btn dark" onClick={() => setCreating(true)}>
          <Icon name="plus" /> New project
        </button></div>}
      </div>
      <div className="stats">
        <div className="stat"><strong>{totals.projects}</strong><span><Icon name="grid" /> Projects</span></div>
        <div className="stat"><strong>{totals.photos}</strong><span><Icon name="image" /> Labeled photos</span></div>
        <div className="stat"><strong>{totals.models}</strong><span><Icon name="layers" /> Trained models</span></div>
        <div className="stat"><strong>{totals.training}</strong><span><Icon name="cpu" /> Training now</span></div>
      </div>
    </section>

    <section className="stack">
      <div className="page-head">
        <div><h2>Your projects</h2><p className="small">Each project learns to find the objects you label.</p></div>
        <div className="toolbar">
          <label className="input-icon"><Icon name="zoomIn" /><span className="sr-only">Search projects</span>
            <input className="input" type="search" placeholder="Search projects or classes" value={query}
              onChange={event => setQuery(event.target.value)} /></label>
          <div className="seg" role="group" aria-label="Filter projects">
            {([['all', 'All'], ['progress', 'In progress'], ['ready', 'Model ready']] as const).map(([value, label]) =>
              <button key={value} type="button" aria-pressed={filter === value} onClick={() => setFilter(value)}>{label}</button>)}
          </div>
        </div>
      </div>

      {error && <ErrorBox message={error} onRetry={() => setAttempt(value => value + 1)} />}
      {!projects && !error && <div className="projects">{[0, 1, 2].map(index => <div key={index} className="skeleton" style={{ height: 220 }} />)}</div>}
      {projects && projects.length === 0 && <div className="empty">
        <span className="bubble"><Icon name="layers" /></span>
        <h2>Create your first project</h2>
        <p className="muted" style={{ maxWidth: '46ch' }}>A project holds your photos, labels, and trained models for one inspection task, such as “Helmet detection” or “Bottle caps”.</p>
        {canEdit ? <button type="button" className="btn" onClick={() => setCreating(true)}><Icon name="plus" /> New project</button>
          : <p className="muted">You have view-only access in this workspace.</p>}
      </div>}
      {projects && projects.length > 0 && <div className="projects">
        {canEdit && filter === 'all' && !query && <button type="button" className="new-project" onClick={() => setCreating(true)}>
          <span className="bubble"><Icon name="plus" /></span>New project
        </button>}
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
      aria-label={`Delete ${project.part_name}`} title="Delete project" onClick={onDelete}><Icon name="trash" /></button>}
  </div>;
}

const CHECK_TEMPLATES: { name: string; object: string; good: string; defects: { name: string; hint: string }[] }[] = [
  { name: 'Bottle caps', object: 'bottle', good: 'Bottle WITH a cap', defects: [{ name: 'No cap', hint: 'Bottle WITHOUT a cap' }] },
  { name: 'Safety helmets', object: 'worker', good: 'Person wearing a helmet', defects: [{ name: 'No helmet', hint: 'Person without a helmet' }] },
  { name: 'Part surface', object: 'part', good: 'Clean part, no damage', defects: [{ name: 'Scratch', hint: 'Visible scratch' }, { name: 'Dent', hint: 'Dent or bend' }] },
  { name: 'Labels', object: 'product', good: 'Label present and straight', defects: [{ name: 'Missing label', hint: 'No label' }, { name: 'Crooked label', hint: 'Label tilted' }] },
];

type Mode = 'check' | 'count';
type DefectRow = { name: string; hint: string };

function CreateProject({ orgId, onClose }: { orgId: string; onClose: () => void }) {
  const [mode, setMode] = useState<Mode>('check');
  const [name, setName] = useState('');
  const [object, setObject] = useState('');
  const [goodHint, setGoodHint] = useState('');
  const [defects, setDefects] = useState<DefectRow[]>([{ name: '', hint: '' }]);
  const [classes, setClasses] = useState<string[]>([]);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const toast = useToast();

  const objectName = object.trim() || 'item';
  const goodName = `Good ${objectName}`.slice(0, 80);
  const usedDefects = defects.filter(row => row.name.trim());

  function useTemplate(template: typeof CHECK_TEMPLATES[number]) {
    setObject(template.object);
    setGoodHint(template.good);
    setDefects(template.defects.map(row => ({ ...row })));
    if (!name.trim()) setName(`${template.name} check`);
  }

  function addClass() {
    const label = draft.trim();
    if (!label) return;
    if (classes.some(item => item.toLowerCase() === label.toLowerCase())) return setError(`“${label}” is already in the list.`);
    setError('');
    setClasses(current => [...current, label.slice(0, 80)]);
    setDraft('');
  }

  async function create() {
    if (!name.trim() || busy) return;
    let finalClasses: string[];
    let info: Record<string, { kind: 'good' | 'defect' | 'object'; hint: string }>;
    if (mode === 'check') {
      if (!object.trim()) return setError('Say what you are checking, for example “bottle”.');
      if (!usedDefects.length) return setError('Add at least one defect, for example “No cap”.');
      finalClasses = [goodName, ...usedDefects.map(row => row.name.trim().slice(0, 80))];
      if (new Set(finalClasses.map(item => item.toLowerCase())).size !== finalClasses.length) return setError('Each name must be different.');
      info = {
        [goodName]: { kind: 'good', hint: goodHint.trim().slice(0, 120) },
        ...Object.fromEntries(usedDefects.map(row => [row.name.trim().slice(0, 80), { kind: 'defect' as const, hint: row.hint.trim().slice(0, 120) }])),
      };
    } else {
      const pending = draft.trim() && !classes.some(item => item.toLowerCase() === draft.trim().toLowerCase()) ? [draft.trim()] : [];
      finalClasses = [...classes, ...pending];
      if (!finalClasses.length) return setError('Add at least one thing to find.');
      info = Object.fromEntries(finalClasses.map(label => [label, { kind: 'object' as const, hint: '' }]));
    }
    setBusy(true);
    setError('');
    try {
      const id = crypto.randomUUID();
      await saveTrainingDataset(orgId, {
        id, revision: 0, part_name: name.trim(), classes: finalClasses, class_info: info, inspection_note: '', photos: [],
      });
      toast('Project created');
      window.location.hash = projectHref(orgId, id, 'upload');
    } catch (cause) {
      setError(errorText(cause, 'Could not create the project.'));
      setBusy(false);
    }
  }

  return <Modal title="New project" wide description="Answer three quick questions. You can change everything later." onClose={onClose}
    footer={<>
      <button type="button" className="btn ghost" onClick={onClose} disabled={busy}>Cancel</button>
      <button type="button" className="btn" disabled={busy || !name.trim()} onClick={() => void create()}>
        {busy ? 'Creating…' : <>Create project <Icon name="arrow" /></>}
      </button>
    </>}>
    <div className="field" role="group" aria-labelledby="mode-label">
      <span id="mode-label">1. What do you want the model to do?</span>
      <div className="mode-cards">
        <button type="button" className="mode-card" aria-pressed={mode === 'check'} onClick={() => setMode('check')}>
          <span className="ribbon">Recommended</span>
          <strong><Icon name="check" /> Tell good from defective</strong>
          <small>Each result is PASS or FAIL. Example: bottle with a cap = PASS, without a cap = FAIL.</small>
        </button>
        <button type="button" className="mode-card" aria-pressed={mode === 'count'} onClick={() => setMode('count')}>
          <strong><Icon name="grid" /> Find and count things</strong>
          <small>Each result is a list of what it found. Example: 3 helmets, 2 vests.</small>
        </button>
      </div>
    </div>

    <label className="field">2. Project name
      <input maxLength={80} value={name} placeholder={mode === 'check' ? 'e.g. Bottle cap check' : 'e.g. Helmet counting'}
        onChange={event => setName(event.target.value)} />
    </label>

    {mode === 'check' ? <div className="field">
      <span>3. Describe good and defective</span>
      <div className="row" style={{ gap: '.4rem' }}><span className="small muted">Quick start:</span>
        {CHECK_TEMPLATES.map(template => <button key={template.name} type="button" className="btn ghost small"
          onClick={() => useTemplate(template)}>{template.name}</button>)}</div>
      <div className="fields" style={{ gridTemplateColumns: '1fr 1.4fr' }}>
        <label className="field">What are you checking?<input value={object} maxLength={60} placeholder="e.g. bottle"
          onChange={event => setObject(event.target.value)} /></label>
        <label className="field">What does a GOOD one look like?<input value={goodHint} maxLength={120} placeholder="e.g. Bottle WITH a cap"
          onChange={event => setGoodHint(event.target.value)} /></label>
      </div>
      <div className="class-row" style={{ gridTemplateColumns: 'auto 1fr auto' }}>
        <span className="kind good"><Icon name="check" />Good</span><b>{goodName}</b><span className="small muted">→ PASS</span>
      </div>
      <span style={{ marginTop: '.4rem' }}>What can be WRONG? Add one line per defect.</span>
      {defects.map((row, position) => <div key={position} className="class-row" style={{ gridTemplateColumns: 'auto 1fr 1.3fr auto' }}>
        <span className="kind defect"><Icon name="alert" />Defect</span>
        <input className="input" value={row.name} maxLength={80} placeholder="Name, e.g. No cap" aria-label="Defect name"
          onChange={event => setDefects(current => current.map((item, index) => index === position ? { ...item, name: event.target.value } : item))} />
        <input className="input" value={row.hint} maxLength={120} placeholder="Looks like, e.g. bottle WITHOUT a cap" aria-label="Defect description"
          onChange={event => setDefects(current => current.map((item, index) => index === position ? { ...item, hint: event.target.value } : item))} />
        <button type="button" className="icon-btn" aria-label="Remove defect" disabled={defects.length === 1}
          onClick={() => setDefects(current => current.filter((_, index) => index !== position))}><Icon name="close" /></button>
      </div>)}
      <div><button type="button" className="btn ghost small" onClick={() => setDefects(current => [...current, { name: '', hint: '' }])}>
        <Icon name="plus" /> Add another defect</button></div>
      <div className="example-box small">
        <b>When labeling</b> you will draw <b>one box around each whole {objectName}</b> and pick
        “{goodName}”{usedDefects.length ? <> or {usedDefects.map(row => `“${row.name.trim()}”`).join(' / ')}</> : null}.
        Upload photos of <b>both good and defective</b> {objectName}s, about the same number of each.
      </div>
    </div> : <div className="field">
      <span>3. What should it find? <span className="hint">· one class per kind of thing</span></span>
      <div className="row" style={{ gap: '.4rem' }}><span className="small muted">Quick start:</span>
        {TEMPLATES.filter(item => item.classes.length).map(item => <button key={item.name} type="button" className="btn ghost small"
          onClick={() => { setClasses([...item.classes]); if (!name.trim()) setName(item.name); }}>{item.name}</button>)}</div>
      <div className="class-editor">
        {classes.map((label, index) => <div className="class-row" key={label}>
          <span className="swatch" style={{ background: classColor(index) }} />
          <span style={{ fontWeight: 500 }}>{label}</span>
          {index < 9 ? <kbd>{index + 1}</kbd> : <span />}
          <button type="button" className="icon-btn" aria-label={`Remove ${label}`}
            onClick={() => setClasses(current => current.filter(item => item !== label))}><Icon name="close" /></button>
        </div>)}
        <div className="add-row">
          <input className="input" value={draft} maxLength={80} placeholder={classes.length ? 'Add another' : 'e.g. Helmet'}
            onChange={event => setDraft(event.target.value)}
            onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); addClass(); } }} />
          <button type="button" className="btn ghost" onClick={addClass} disabled={!draft.trim()}><Icon name="plus" /> Add</button>
        </div>
      </div>
    </div>}
    {error && <ErrorBox message={error} />}
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
  return <Modal title={`Delete “${project.part_name}”?`} onClose={onClose}
    description="This permanently removes its photos, labels, and trained models. It cannot be undone."
    footer={<>
      <button type="button" className="btn ghost" onClick={onClose} disabled={busy}>Keep project</button>
      <button type="button" className="btn dark" disabled={busy} onClick={async () => {
        setBusy(true);
        setError('');
        try {
          await deleteTrainingDataset(orgId, project.id);
          toast('Project deleted');
          onDeleted();
        } catch (cause) {
          setError(errorText(cause, 'Could not delete the project.'));
          setBusy(false);
        }
      }}><Icon name="trash" /> {busy ? 'Deleting…' : 'Delete project'}</button>
    </>}>
    <p>{project.photo_count} photos and {project.model_count} trained {project.model_count === 1 ? 'model' : 'models'} will be deleted.</p>
    {error && <ErrorBox message={error} />}
  </Modal>;
}
