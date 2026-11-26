import { useEffect, useState } from 'react';

import { useWorkspace } from '../../context/WorkspaceContext';
import { createProgram, listPrograms, type ProgramSummary } from '../../services/api/inspectionPrograms';
import { listTrainingDatasets, type ProjectSummary } from '../../services/api/trainingDatasets';
import { Icon } from '../../ui/Icon';
import { ErrorBox, Loading, Modal, errorText, timeAgo } from '../../ui/common';

export function ProgramsPage() {
  const { org, canEdit } = useWorkspace();
  const orgId = org!.org_id;
  const [programs, setPrograms] = useState<ProgramSummary[] | null>(null);
  const [error, setError] = useState('');
  const [creating, setCreating] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setError('');
    listPrograms(orgId, controller.signal).then(setPrograms).catch(cause => {
      if (!controller.signal.aborted) setError(errorText(cause, 'Could not load inspection programs.'));
    });
    return () => controller.abort();
  }, [orgId, attempt]);

  return <main className="page">
    <header className="page-head">
      <div>
        <span className="eyebrow"><Icon name="layers" /> Object detection</span>
        <h1 style={{ marginTop: '.3rem' }}>Inspection programs</h1>
        <p>A program turns a trained model into a pass/fail check: zones on the board, and what must be in each zone.</p>
      </div>
      {canEdit && <button type="button" className="btn" onClick={() => setCreating(true)}><Icon name="plus" /> New program</button>}
    </header>

    <ol className="flow-steps how-programs" aria-label="How a program works">
      {([['camera', 'Board photo', 'Same jig, camera and light every time'],
        ['grid', 'Zones', 'Draw an area for each part of the board'],
        ['star', 'Golden layout', 'Capture a good board: expected counts per zone'],
        ['target', 'Model finds parts', 'Bolts, wires, switches per zone'],
        ['flag', 'Pass / fail', 'Missing, extra or defect = fail']] as const).map(([icon, title, text], index) =>
        <li key={title}><span className="flow-icon"><Icon name={icon} /></span><span className="flow-num">{index + 1}</span>
          <strong>{title}</strong><small>{text}</small></li>)}
    </ol>

    {error && <ErrorBox message={error} onRetry={() => setAttempt(value => value + 1)} />}
    {!programs && !error && <Loading label="Loading programs…" />}
    {programs && programs.length === 0 && <div className="empty">
      <span className="bubble"><Icon name="layers" /></span>
      <h2>No inspection programs yet</h2>
      <p className="muted">Train a model in a project first. Then create a program to check boards with it.</p>
      {canEdit && <button type="button" className="btn" onClick={() => setCreating(true)}><Icon name="plus" /> New program</button>}
    </div>}
    {programs && programs.length > 0 && <div className="projects">
      {programs.map(program => <ProgramCard key={program.id} program={program} />)}
    </div>}

    {creating && <CreateProgram orgId={orgId} onClose={() => setCreating(false)} />}
  </main>;
}

function ProgramCard({ program }: { program: ProgramSummary }) {
  const passRate = program.run_count ? Math.round(100 * program.pass_count / program.run_count) : null;
  const ready = program.model_job_id && program.zone_count > 0;
  return <a className="project" href={`#/programs/${program.id}`}>
    <div className="project-top">
      <span className="project-icon"><Icon name="layers" /></span>
      <div style={{ minWidth: 0 }}>
        <h3 title={program.name}>{program.name}</h3>
        <div className="project-meta"><Icon name="grid" /> {program.dataset_name}</div>
      </div>
    </div>
    <dl className="mini-stats">
      <div><dt>Zones</dt><dd>{program.zone_count}</dd></div>
      <div><dt>Boards checked</dt><dd>{program.run_count}</dd></div>
      <div><dt>Pass rate</dt><dd>{passRate === null ? '—' : `${passRate}%`}</dd></div>
    </dl>
    <div className="project-foot">
      {!ready ? <span className="chip"><Icon name="alert" /> {program.model_job_id ? 'Add zones' : 'Choose a model'}</span>
        : program.pending_reviews ? <span className="chip dark"><Icon name="eye" /> {program.pending_reviews} to review</span>
          : <span className="chip plain"><Icon name="check" /> Ready</span>}
      <span className="muted small">{program.last_run_at ? `Last run ${timeAgo(program.last_run_at)}` : `Edited ${timeAgo(program.updated_at)}`}</span>
    </div>
  </a>;
}

function CreateProgram({ orgId, onClose }: { orgId: string; onClose: () => void }) {
  const [projects, setProjects] = useState<ProjectSummary[] | null>(null);
  const [datasetId, setDatasetId] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    listTrainingDatasets(orgId, controller.signal).then(result => {
      setProjects(result);
      const trained = result.find(project => project.model_count > 0) ?? result[0];
      if (trained) {
        setDatasetId(trained.id);
        setName(`${trained.part_name} check`);
      }
    }).catch(cause => { if (!controller.signal.aborted) setError(errorText(cause, 'Could not load projects.')); });
    return () => controller.abort();
  }, [orgId]);

  async function create() {
    if (!datasetId || !name.trim() || busy) return;
    setBusy(true);
    setError('');
    try {
      const program = await createProgram(orgId, name.trim(), datasetId);
      window.location.hash = `#/programs/${program.id}`;
    } catch (cause) {
      setError(errorText(cause, 'Could not create the program.'));
      setBusy(false);
    }
  }

  return <Modal title="New inspection program" onClose={onClose}
    description="Choose the project whose trained model will check the boards."
    footer={<>
      <button type="button" className="btn ghost" onClick={onClose}>Cancel</button>
      <button type="button" className="btn" disabled={!datasetId || !name.trim() || busy} onClick={() => void create()}>
        <Icon name="check" /> {busy ? 'Creating…' : 'Create program'}</button>
    </>}>
    {!projects && !error && <Loading label="Loading projects…" />}
    {projects && projects.length === 0 && <div className="notice"><Icon name="info" />Create a project and train a model first.</div>}
    {projects && projects.length > 0 && <>
      <div className="field"><span>Project</span>
        <div className="choice-grid">{projects.map(project => <button key={project.id} type="button" className="choice"
          aria-pressed={datasetId === project.id} onClick={() => { setDatasetId(project.id); setName(`${project.part_name} check`); }}>
          <strong>{project.part_name}</strong>
          <small>{project.model_count ? `${project.model_count} trained ${project.model_count === 1 ? 'model' : 'models'}` : 'No trained model yet'}</small>
        </button>)}</div>
      </div>
      <label className="field">Program name
        <input maxLength={80} value={name} onChange={event => setName(event.target.value)} placeholder="e.g. Board A top side" />
        <small>Tip: one program per board side or camera position.</small>
      </label>
    </>}
    {error && <ErrorBox message={error} />}
  </Modal>;
}
