import { useEffect, useRef, useState } from 'react';

import {
  cancelTrainingJob, checkpointUrl, loadTrainingJob, startTrainingJob, type TrainingJob, type TrainingOptions,
} from '../../services/api/trainingDatasets';
import { Icon, type IconName } from '../../ui/Icon';
import {
  ErrorBox, Loading, QUALITY, errorText, percent, projectHref, qualityBand, qualityPosition, useToast,
} from '../../ui/common';
import { MIN_PHOTOS_PER_CLASS, MIN_PHOTOS_TO_TRAIN, type Project } from '../project/useProject';
import { PhaseSteps, PhotoReadiness, SpeedPicker } from './train/TrainParts';
import { AdvancedSettings, RunSettings, isCustomized, optionsFor, optionsProblem, type Preset } from './train/AdvancedSettings';

const POLL_ACTIVE_MS = 3000;
const MODEL_SIZE = { n: 'Nano', s: 'Small', m: 'Medium', l: 'Large', x: 'Extra large' } as const;
const POLL_RETRY_MS = 5000;

export function TrainStep({ project, orgId, datasetId, onModelsChanged }: {
  project: Project;
  orgId: string;
  datasetId: string;
  onModelsChanged: () => void;
}) {
  const [job, setJob] = useState<TrainingJob | null | undefined>(undefined);
  const [statusError, setStatusError] = useState('');
  const [poll, setPoll] = useState(0);
  const [setupNew, setSetupNew] = useState(false);
  const previousStatus = useRef<string | null>(null);
  const active = job?.status === 'queued' || job?.status === 'running';

  useEffect(() => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    async function check() {
      try {
        const result = await loadTrainingJob(orgId, datasetId, controller.signal);
        if (controller.signal.aborted) return;
        setJob(result);
        setStatusError('');
        if (result?.status === 'queued' || result?.status === 'running') timer = setTimeout(() => void check(), POLL_ACTIVE_MS);
      } catch {
        if (controller.signal.aborted) return;
        setStatusError('Lost connection to the training service. Retrying…');
        timer = setTimeout(() => void check(), POLL_RETRY_MS);
      }
    }
    void check();
    return () => { controller.abort(); clearTimeout(timer); };
  }, [orgId, datasetId, poll]);

  useEffect(() => {
    if (previousStatus.current && previousStatus.current !== 'succeeded' && job?.status === 'succeeded') onModelsChanged();
    previousStatus.current = job?.status ?? null;
  }, [job?.status, onModelsChanged]);

  if (job === undefined) return <main className="page narrow"><Loading label="Checking training status…" /></main>;

  const showRun = job && (active || !setupNew);

  return <main className="page workspace-page train-workspace">
    {statusError && <div className="notice" role="status"><Icon name="info" />{statusError}</div>}
    {showRun ? <RunView job={job} project={project} orgId={orgId} datasetId={datasetId}
      onChanged={() => setPoll(value => value + 1)} onNewRun={() => setSetupNew(true)} />
      : <SetupView project={project} orgId={orgId} datasetId={datasetId} previousOptions={job?.options} onStarted={started => {
        setJob(started);
        setSetupNew(false);
        setPoll(value => value + 1);
      }} />}
  </main>;
}

/* ---------------- Setup ---------------- */

function SetupView({ project, orgId, datasetId, previousOptions, onStarted }: {
  project: Project;
  orgId: string;
  datasetId: string;
  previousOptions?: TrainingOptions | null;
  onStarted: (job: TrainingJob) => void;
}) {
  const [preset, setPreset] = useState<Preset>('balanced');
  const [options, setOptions] = useState<TrainingOptions>(() => optionsFor('balanced'));
  const [advanced, setAdvanced] = useState(false);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState('');
  const toast = useToast();
  const customized = isCustomized(options, preset);
  const blocked = project.blockedReason;

  function set<K extends keyof TrainingOptions>(key: K, value: TrainingOptions[K]) {
    setOptions(current => ({ ...current, [key]: value }));
  }

  function choose(next: Preset) {
    setPreset(next);
    setOptions(current => ({ ...optionsFor(next), version_name: current.version_name, notes: current.notes }));
  }

  async function start() {
    if (starting || blocked || !project.canEdit) return;
    const problem = optionsProblem(options);
    setError(problem);
    if (problem) return;
    setStarting(true);
    try {
      const revision = project.dirty || !project.revision ? await project.save() : project.revision;
      const job = await startTrainingJob(orgId, datasetId, revision, { ...options, preset: customized ? 'custom' : preset });
      toast('Training started');
      onStarted(job);
    } catch (cause) {
      setError(errorText(cause, 'Could not start training.'));
    } finally {
      setStarting(false);
    }
  }

  const validSplit = Number.isFinite(options.validation_percent) && Number.isFinite(options.test_percent)
    && options.validation_percent + options.test_percent <= 50;
  return <>
    <header className="page-head">
      <div><h1>Configure training</h1><p>Choose how the model learns and which photos to save for checking it.</p></div>
      {previousOptions && <button type="button" className="btn ghost" disabled={starting || !project.canEdit} onClick={() => {
        const savedPreset = previousOptions.preset;
        const nextPreset = savedPreset === 'fast' || savedPreset === 'accurate' ? savedPreset : 'balanced';
        setPreset(nextPreset);
        setOptions({ ...optionsFor(nextPreset), ...previousOptions, version_name: '', notes: '' });
      }}><Icon name="copy" /> Use last run’s settings</button>}
    </header>

    <div className="workspace-columns train-columns">
      <fieldset className="stack training-controls" disabled={starting || !project.canEdit}>
        <section className="card workspace-panel"><SpeedPicker preset={preset} onChoose={choose} /></section>
        <RunSettings options={options} set={set} />
        <button type="button" className="btn ghost" aria-expanded={advanced} onClick={() => setAdvanced(value => !value)}>
          <Icon name="sliders" /> {advanced ? 'Hide expert settings' : 'Show expert settings'} <Icon name={advanced ? 'chevronDown' : 'chevron'} />
        </button>
        {advanced && <AdvancedSettings options={options} set={set} labels={project.labels} customized={customized}
          onReset={() => choose(preset)} />}
      </fieldset>
      <aside className="stack">
        <section className="card workspace-panel training-summary">
          <div className="row"><h2 className="spacer">Run summary</h2>
            <span className="chip plain">{customized ? 'Custom settings' : 'Preset settings'}</span></div>
          <dl className="workspace-list">
            <div><dt>Reviewed photos</dt><dd>{project.reviewed} of {project.photos.length}</dd></div>
            <div><dt>Labels</dt><dd>{project.labels.length}</dd></div>
            {validSplit && <div><dt>Train / validate / test</dt>
              <dd>{100 - options.validation_percent - options.test_percent}% / {options.validation_percent}% / {options.test_percent}%</dd></div>}
          </dl>
          {blocked && <div className="notice"><Icon name="info" /> {blocked}</div>}
          {error && <ErrorBox message={error} />}
          {project.canEdit ? <button type="button" className="btn dark large block" disabled={starting || !!blocked} onClick={() => void start()}>
            {starting ? <><span className="spinner" /> {project.saving ? 'Saving your labels…' : 'Starting…'}</> : <><Icon name="play" /> Start training</>}
          </button> : <div className="notice"><Icon name="lock" /> You have view-only access.</div>}
          <p className="small muted">You can close this page while training runs.</p>
        </section>
        <ReadyChecklist project={project} orgId={orgId} datasetId={datasetId} />
        <PhotoReadiness project={project} fixHref={projectHref(orgId, datasetId,
          project.photos.length < MIN_PHOTOS_TO_TRAIN ? 'upload' : !project.labels.length ? 'detect' : 'label')} />
      </aside>
    </div>
  </>;
}

/* ---------------- Progress ---------------- */

function RunView({ job, project, orgId, datasetId, onChanged, onNewRun }: {
  job: TrainingJob;
  project: Project;
  orgId: string;
  datasetId: string;
  onChanged: () => void;
  onNewRun: () => void;
}) {
  const [stopping, setStopping] = useState(false);
  const [confirmStop, setConfirmStop] = useState(false);
  const [details, setDetails] = useState(false);
  const [error, setError] = useState('');
  const done = job.status === 'succeeded';
  const active = job.status === 'queued' || job.status === 'running';
  const phase = done ? 3 : job.progress?.phase === 'checking' ? 2 : job.progress?.phase === 'learning' ? 1 : 0;
  const { epoch = 0, epochs, eta_seconds: eta } = job.progress ?? {};
  const pct = done ? 100 : phase === 2 ? 97 : epoch && epochs ? Math.min(95, Math.round(5 + 90 * epoch / epochs)) : job.status === 'running' ? 3 : 0;
  const score = job.evaluation?.['metrics/mAP50-95(B)'] ?? job.progress?.score ?? null;
  const precision = job.evaluation?.['metrics/precision(B)'];
  const recall = job.evaluation?.['metrics/recall(B)'];
  const f1 = precision !== undefined && recall !== undefined && precision + recall > 0 ? 2 * precision * recall / (precision + recall) : undefined;

  const headline = {
    queued: 'Waiting to start', running: ['Getting ready', 'Learning', 'Checking'][phase],
    succeeded: 'Your model is ready', failed: 'Training did not finish', cancelled: 'Training stopped',
  }[job.status];

  const subline = active
    ? <>{eta && eta > 0 ? <>{formatEta(eta)} left. </> : job.status === 'queued' ? 'In the queue. ' : ''}You can close this page.</>
    : done ? 'Try it on new photos.'
      : job.status === 'cancelled' ? 'You can change settings and start a new run.' : null;

  async function stop() {
    setStopping(true);
    setError('');
    try {
      await cancelTrainingJob(orgId, datasetId, job.id);
      setConfirmStop(false);
      onChanged();
    } catch (cause) {
      setError(errorText(cause, 'Could not stop training.'));
    } finally {
      setStopping(false);
    }
  }

  return <>
    <section className="card progress-card">
      <div className="ring" role="progressbar" aria-label="Training progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}>
        <svg viewBox="0 0 200 200" aria-hidden="true">
          <circle cx="100" cy="100" r="84" className="track" />
          <circle cx="100" cy="100" r="84" className={`fill${done ? ' done' : ''}`} pathLength={100}
            strokeDasharray={`${pct} 100`} transform="rotate(-90 100 100)" />
        </svg>
        <div><strong>{job.status === 'failed' || job.status === 'cancelled' ? '—' : `${pct}%`}</strong><small>{done ? 'complete' : 'done'}</small></div>
      </div>
      <div className="progress-copy">
        <h1>{headline}</h1>
        {subline && <p>{subline}</p>}
        {job.error && <div className="alert" style={{ marginTop: '1rem' }}><Icon name="alert" />{job.error}</div>}
        <PhaseSteps phase={phase} done={done} active={active} />
      </div>
    </section>

    <section className="card quality" aria-label="Model quality">
      <header><h2>{done ? 'How good is it?' : 'How good is it so far?'}</h2>
        {score !== null && <b>{QUALITY[qualityBand(score)]}</b>}</header>
      {score === null ? <p className="muted">{active ? 'A score appears soon.' : 'No score is available for this run.'}</p> : <>
        <div className="q-track" role="meter" aria-label="Model quality" aria-valuemin={0} aria-valuemax={100}
          aria-valuenow={Math.round(score * 100)} aria-valuetext={QUALITY[qualityBand(score)]}>
          <span /><span /><span /><span />
          <i className="q-marker" style={{ left: `${qualityPosition(score)}%` }} />
        </div>
        <div className="q-labels">{QUALITY.map((label, index) => <span key={label} className={index === qualityBand(score) ? 'on' : ''}>{label}</span>)}</div>
        <p className="muted small">{active ? 'Still improving.' : 'Measured on photos it never studied.'}</p>
      </>}
    </section>

    {error && <ErrorBox message={error} />}
    {confirmStop && <div className="alert" role="alertdialog" aria-label="Confirm stop">
      <Icon name="alert" />
      <div className="spacer">Stop this training run? Progress so far will be discarded.</div>
      <button type="button" className="btn ghost small" onClick={() => setConfirmStop(false)}>Keep training</button>
      <button type="button" className="btn dark small" disabled={stopping} onClick={() => void stop()}>{stopping ? 'Stopping…' : 'Stop'}</button>
    </div>}

    <div className="run-actions">
      <div className="row">
        {active && project.canEdit && <button type="button" className="btn danger" disabled={stopping} onClick={() => setConfirmStop(true)}>
          <span className="stop-square" /> Stop training
        </button>}
        {done && <a className="btn large" href={projectHref(orgId, datasetId, 'test')}>Test your model <Icon name="arrow" /></a>}
        {!active && project.canEdit && <button type="button" className={`btn ${done ? 'ghost' : ''}`} onClick={onNewRun}>
          <Icon name={done ? 'plus' : 'play'} /> {done ? 'Train another version' : 'Start a new run'}
        </button>}
      </div>
      <button type="button" className="btn link" aria-expanded={details} onClick={() => setDetails(value => !value)}>
        {details ? 'Hide details' : 'More details'} <Icon name={details ? 'chevronDown' : 'chevron'} />
      </button>
    </div>

    {details && <section className="card tech" aria-label="Technical details">
      <dl className="metrics">
        <div className="metric"><dt>Status</dt><dd style={{ fontSize: '1rem', textTransform: 'capitalize' }}>{job.status}</dd></div>
        <div className="metric"><dt>Round</dt><dd>{epoch || '—'}{epochs ? ` / ${epochs}` : ''}</dd></div>
        <div className="metric"><dt>Overall score</dt><dd>{percent(score, 1)}</dd></div>
        {job.evaluation && <>
          <div className="metric" title="Of the parts it finds, how many are right"><dt>Right when it finds</dt><dd>{percent(precision, 1)}</dd></div>
          <div className="metric" title="Of the parts that are there, how many it finds"><dt>Finds what is there</dt><dd>{percent(recall, 1)}</dd></div>
          {f1 !== undefined && <div className="metric"><dt>Balance</dt><dd>{percent(f1, 1)}</dd></div>}
        </>}
      </dl>
      <div className="table-wrap"><table className="data"><tbody>
        <tr><th scope="row">Version</th><td>{job.version_name || '—'}</td></tr>
        <tr><th scope="row">Started</th><td>{new Date(job.created_at).toLocaleString()}</td></tr>
        {job.finished_at && <tr><th scope="row">Finished</th><td>{new Date(job.finished_at).toLocaleString()}</td></tr>}
        <tr><th scope="row">Photo set version</th><td>{job.dataset_revision}</td></tr>
        {job.options && <tr><th scope="row">Settings</th><td>
          {job.options.preset && job.options.preset !== 'custom' ? `${job.options.preset} preset · ` : ''}
          {MODEL_SIZE[job.options.model_size ?? 'n']} model · {job.options.imgsz}px photos · {job.options.epochs} rounds
        </td></tr>}
        {job.notes && <tr><th scope="row">Notes</th><td>{job.notes}</td></tr>}
      </tbody></table></div>
      {done && <div className="row">
        <a className="btn ghost small" href={checkpointUrl(orgId, datasetId, job.id)}><Icon name="download" /> Download model</a>
        
      </div>}
    </section>}
  </>;
}

function formatEta(seconds: number) {
  const minutes = Math.max(1, Math.round(seconds / 60));
  if (minutes < 60) return `About ${minutes} ${minutes === 1 ? 'minute' : 'minutes'}`;
  const hours = Math.round(minutes / 6) / 10;
  return `About ${hours} ${hours === 1 ? 'hour' : 'hours'}`;
}

/** Four ticks before training. Each one links to the step that fixes it. */
function ReadyChecklist({ project, orgId, datasetId }: { project: Project; orgId: string; datasetId: string }) {
  const thin = project.labels.filter(label => (project.labelCounts[label] ?? 0) < MIN_PHOTOS_PER_CLASS);
  const items: { icon: IconName; title: string; ok: boolean; hint: string; step: 'upload' | 'detect' | 'label' }[] = [
    { icon: 'tag', title: 'What to find', step: 'detect', ok: project.labels.length > 0,
      hint: project.labels.length ? project.labels.slice(0, 3).join(', ') + (project.labels.length > 3 ? '…' : '') : 'Not set' },
    { icon: 'flag', title: 'Pass / fail', step: 'detect', ok: project.passFail,
      hint: project.passFail ? 'Rule set' : 'Optional' },
    { icon: 'camera', title: 'Photos', step: 'upload', ok: project.photos.length >= MIN_PHOTOS_TO_TRAIN,
      hint: project.photos.length >= MIN_PHOTOS_TO_TRAIN ? `${project.photos.length} added` : `Add ${MIN_PHOTOS_TO_TRAIN - project.photos.length} more` },
    { icon: 'box', title: 'Marked', step: thin.length ? 'upload' : 'label',
      ok: project.photos.length > 0 && project.reviewed === project.photos.length && !thin.length,
      hint: thin.length ? `More photos of ${thin[0]}` : `${project.reviewed}/${project.photos.length} photos` },
  ];
  return <ol className="ready-list" aria-label="Ready to train?">
    {items.map(item => <li key={item.title} className={item.ok ? 'ok' : item.title === 'Pass / fail' ? 'opt' : 'todo'}>
      <a href={projectHref(orgId, datasetId, item.step)}>
        <span className="ready-icon"><Icon name={item.ok ? 'check' : item.icon} /></span>
        <strong>{item.title}</strong>
        <small>{item.hint}</small>
      </a>
    </li>)}
  </ol>;
}
