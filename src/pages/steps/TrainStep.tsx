import { useEffect, useRef, useState, type ReactNode } from 'react';

import {
  cancelTrainingJob, checkpointUrl, loadTrainingJob, startTrainingJob, type TrainingJob, type TrainingOptions,
} from '../../services/api/trainingDatasets';
import { Icon, type IconName } from '../../ui/Icon';
import {
  ErrorBox, Loading, QUALITY, classColor, errorText, percent, projectHref, qualityBand, qualityPosition, useToast,
} from '../../ui/common';
import type { Project } from '../ProjectStudio';

type Preset = 'fast' | 'balanced' | 'accurate';

const PRESETS: Record<Preset, {
  name: string; sub: string; time: string; accuracy: number; accuracyLabel: string; icon: IconName;
  values: Partial<TrainingOptions>;
}> = {
  fast: {
    name: 'Fast', sub: 'Quick first result', time: 'Shortest run', accuracy: 1, accuracyLabel: 'Good', icon: 'bolt',
    values: { epochs: 30, imgsz: 512, patience: 10, max_minutes: 60 },
  },
  balanced: {
    name: 'Balanced', sub: 'Best for most projects', time: 'About 3× Fast', accuracy: 2, accuracyLabel: 'Better', icon: 'target',
    values: { epochs: 100, imgsz: 640, patience: 20, max_minutes: 180 },
  },
  accurate: {
    name: 'Most accurate', sub: 'Takes longer, finds more', time: 'About 3× Balanced', accuracy: 3, accuracyLabel: 'Best', icon: 'star',
    values: { epochs: 200, imgsz: 768, patience: 40, max_minutes: 240, cos_lr: true },
  },
};

const BASE: TrainingOptions = {
  version_name: '', notes: '', preset: 'balanced', model_size: 'n', pretrained: true, optimizer: 'SGD', cos_lr: false,
  validation_percent: 20, test_percent: 10, min_box_px: 0, seed: 0,
  epochs: 100, batch: 16, imgsz: 640, freeze: 0, lr0: .01, lrf: .01, warmup_epochs: 3, momentum: .937, weight_decay: .0005, patience: 20,
  box: 7.5, cls: .5, dfl: 1.5,
  degrees: 0, translate: .1, scale: .5, shear: 0, perspective: 0, hsv_h: .015, hsv_s: .7, hsv_v: .4,
  fliplr: .5, flipud: 0, mosaic: 1, mixup: 0, copy_paste: 0, erasing: .4, close_mosaic: 10,
  iou: .7, max_det: 300, save_period: 0, max_minutes: 180,
};

function optionsFor(preset: Preset): TrainingOptions {
  return { ...BASE, ...PRESETS[preset].values, preset };
}

type NumKey = { [K in keyof TrainingOptions]: TrainingOptions[K] extends number ? K : never }[keyof TrainingOptions];
type NumField = { key: NumKey; label: string; min: number; max: number; step: number; hint?: string };

const n = (key: NumKey, label: string, min: number, max: number, step: number, hint?: string): NumField => ({ key, label, min, max, step, hint });

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
        if (result?.status === 'queued' || result?.status === 'running') timer = setTimeout(() => void check(), 3000);
      } catch {
        if (controller.signal.aborted) return;
        setStatusError('Lost connection to the training service. Retrying…');
        timer = setTimeout(() => void check(), 5000);
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

  return <main className="page narrow">
    {statusError && <div className="notice" role="status"><Icon name="info" />{statusError}</div>}
    {showRun ? <RunView job={job} project={project} orgId={orgId} datasetId={datasetId}
      onChanged={() => setPoll(value => value + 1)} onNewRun={() => setSetupNew(true)} />
      : <SetupView project={project} orgId={orgId} datasetId={datasetId} onStarted={started => {
        setJob(started);
        setSetupNew(false);
        setPoll(value => value + 1);
      }} />}
  </main>;
}

/* ---------------- Setup ---------------- */

function SetupView({ project, orgId, datasetId, onStarted }: {
  project: Project;
  orgId: string;
  datasetId: string;
  onStarted: (job: TrainingJob) => void;
}) {
  const [preset, setPreset] = useState<Preset>('balanced');
  const [options, setOptions] = useState<TrainingOptions>(() => optionsFor('balanced'));
  const [advanced, setAdvanced] = useState(false);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState('');
  const toast = useToast();
  const labeled = project.photos.filter(photo => photo.reviewed).length;
  const customized = JSON.stringify({ ...options, version_name: '', notes: '' }) !== JSON.stringify({ ...optionsFor(preset), version_name: '', notes: '' });
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
    setError('');
    if (options.validation_percent + options.test_percent > 50) {
      setError('Keep at least half of your photos for training: lower the validation or test share.');
      setAdvanced(true);
      return;
    }
    const invalid = (Object.keys(options) as (keyof TrainingOptions)[]).find(key => typeof options[key] === 'number' && !Number.isFinite(options[key]));
    if (invalid) {
      setError('One of the advanced settings is empty. Fill it in or reset to the preset.');
      setAdvanced(true);
      return;
    }
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

  return <>
    <header className="page-head center">
      <span className="eyebrow">Step 3 of 5</span>
      <h1 style={{ fontSize: 'clamp(2rem, 4vw, 3rem)' }}>Train your model</h1>
      <p>Pick one option, then press Start. We do the rest.</p>
    </header>

    <section className="card ready-card" aria-live="polite">
      <span className={`badge${blocked ? ' warn' : ''}`}><Icon name={blocked ? 'alert' : 'check'} /></span>
      <div className="spacer">
        <h2>{blocked ? 'Your photos need a little more work' : 'Your images are ready'}</h2>
        <p>{blocked || <>{labeled.toLocaleString()} labeled images · It will learn to find: {project.labels.filter(label => project.labelCounts[label]).join(', ')}</>}</p>
      </div>
      <a className="btn link" href={projectHref(orgId, datasetId, 'label')}>{blocked ? 'Fix' : 'View'}</a>
    </section>

    <Readiness project={project} />

    <section className="stack" style={{ gap: '1.4rem' }}>
      <h2>How should we train it?</h2>
      <div className="presets" role="radiogroup" aria-label="Training option">
        {(Object.keys(PRESETS) as Preset[]).map(key => {
          const item = PRESETS[key];
          return <label key={key} className="preset">
            <input type="radio" name="preset" checked={preset === key} onChange={() => choose(key)} />
            {key === 'balanced' && <span className="ribbon">Recommended</span>}
            <span className="tick"><Icon name="check" /></span>
            <span className="p-icon"><Icon name={item.icon} /></span>
            <strong>{item.name}</strong>
            <span className="sub">{item.sub}</span>
            <span className="time">{item.time}</span>
            <span className="acc">Accuracy {[1, 2, 3].map(dot => <i key={dot} className={dot <= item.accuracy ? 'on' : ''} />)} <b>{item.accuracyLabel}</b></span>
          </label>;
        })}
      </div>
    </section>

    {error && <ErrorBox message={error} />}
    {project.canEdit ? <button type="button" className="btn large block" disabled={starting || !!blocked} onClick={() => void start()}>
      {starting ? <><span className="spinner" /> {project.saving ? 'Saving your labels…' : 'Starting…'}</> : <><Icon name="play" /> Start training</>}
    </button> : <div className="notice"><Icon name="lock" />You have view-only access, so you cannot start training.</div>}
    <p className="center-note">You can close this page. Training keeps running and the result will be here when you come back.
      Exact time depends on your photos and hardware; a live estimate appears once training starts.</p>

    <div className="advanced-toggle">
      <button type="button" className="btn link" aria-expanded={advanced} onClick={() => setAdvanced(value => !value)}>
        Advanced settings (optional) <Icon name={advanced ? 'chevronDown' : 'chevron'} />
      </button>
    </div>
    {advanced && <Advanced options={options} set={set} labels={project.labels} customized={customized}
      onReset={() => choose(preset)} />}
  </>;
}

function NumberInput({ field, options, set }: { field: NumField; options: TrainingOptions; set: (key: NumKey, value: number) => void }) {
  return <label className="field">{field.label}
    <input type="number" min={field.min} max={field.max} step={field.step}
      value={Number.isNaN(options[field.key]) ? '' : options[field.key]}
      onChange={event => set(field.key, event.target.valueAsNumber)} />
    {field.hint && <small>{field.hint}</small>}
  </label>;
}

function Section({ num, title, summary, children, open }: { num: number; title: string; summary: string; children: ReactNode; open?: boolean }) {
  return <details className="card adv-section" open={open}>
    <summary><span className="num">{num}</span>{title}<small>{summary}</small></summary>
    <div className="adv-body">{children}</div>
  </details>;
}

function Advanced({ options, set, labels, customized, onReset }: {
  options: TrainingOptions;
  set: <K extends keyof TrainingOptions>(key: K, value: TrainingOptions[K]) => void;
  labels: string[];
  customized: boolean;
  onReset: () => void;
}) {
  const num = (fields: NumField[]) => <div className="fields">{fields.map(field =>
    <NumberInput key={field.key} field={field} options={options} set={(key, value) => set(key, value)} />)}</div>;
  const train = 100 - (options.validation_percent || 0) - (options.test_percent || 0);

  return <section className="advanced" aria-label="Advanced settings">
    <div className="row">
      <p className="muted spacer">These settings are for experts. The preset values work well for most projects.</p>
      {customized && <span className="chip">Customized</span>}
      <button type="button" className="btn ghost small" onClick={onReset} disabled={!customized}><Icon name="undo" /> Reset to preset</button>
    </div>

    <Section num={1} title="Project" summary="Version name and notes" open>
      <div className="fields">
        <label className="field">Version name<input maxLength={80} placeholder="e.g. v2 with night shots" value={options.version_name}
          onChange={event => set('version_name', event.target.value)} /></label>
        <label className="field">Task<input value="Object detection (boxes)" disabled /></label>
      </div>
      <label className="field">Run notes<textarea maxLength={1000} rows={2} value={options.notes} placeholder="What changed in this run?"
        onChange={event => set('notes', event.target.value)} /></label>
      <div className="row">{labels.map((label, index) => <span className="chip plain" key={label}>
        <span className="swatch" style={{ background: classColor(index), width: 9, height: 9 }} />{label}</span>)}</div>
    </Section>

    <Section num={2} title="Dataset" summary={`${train}/${options.validation_percent}/${options.test_percent} split`}>
      <div className="split-bar" aria-hidden="true">
        <span className="tr" style={{ width: `${Math.max(0, train)}%` }}>Train {train}%</span>
        <span className="va" style={{ width: `${options.validation_percent}%` }}>Val {options.validation_percent}%</span>
        {options.test_percent > 0 && <span className="te" style={{ width: `${options.test_percent}%` }}>Test {options.test_percent}%</span>}
      </div>
      {num([
        n('validation_percent', 'Validation share (%)', 5, 40, 1, 'Checked during training'),
        n('test_percent', 'Test share (%)', 0, 40, 1, 'Held back for a final score'),
        n('seed', 'Random seed', 0, 2147483647, 1, 'Same seed gives the same split'),
        n('min_box_px', 'Ignore boxes smaller than (px)', 0, 128, 1, 'Measured at the training image size'),
      ])}
      <p className="small muted"><Icon name="check" /> Duplicate photos are skipped on upload and unreadable images are reported before training. Every class is always kept in the training split.</p>
    </Section>

    <Section num={3} title="Model" summary={`YOLO11 ${options.model_size.toUpperCase()} · ${options.imgsz}px`}>
      <div className="field"><span>Model size</span>
        <div className="choice-grid">{([['n', 'Nano', 'Fastest, smallest'], ['s', 'Small', 'Good balance'], ['m', 'Medium', 'More accurate'], ['l', 'Large', 'Slow on CPU'], ['x', 'XL', 'Slowest']] as const)
          .map(([value, label, hint]) => <button type="button" key={value} className="choice" aria-pressed={options.model_size === value}
            onClick={() => set('model_size', value)}><strong>{label}</strong><small>{hint}</small></button>)}</div>
        <small>Architecture: YOLO11, anchor-free. Sizes larger than Nano download their starting weights the first time they are used.</small>
      </div>
      <div className="fields">
        <label className="field">Input image size<select value={options.imgsz} onChange={event => set('imgsz', Number(event.target.value))}>
          {[320, 416, 512, 640, 768, 960, 1024].map(size => <option key={size} value={size}>{size} px</option>)}
        </select><small>Larger finds small objects but trains slower</small></label>
        {num([n('freeze', 'Frozen layers', 0, 10, 1, 'Freeze the backbone for tiny datasets')])}
      </div>
      <label className="check"><input type="checkbox" checked={options.pretrained} onChange={event => set('pretrained', event.target.checked)} />
        Start from pretrained weights (recommended)</label>
    </Section>

    <Section num={4} title="Training" summary={`${options.epochs} epochs · ${options.optimizer}`}>
      {num([
        n('epochs', 'Epochs', 1, 300, 1, 'Passes over your photos'),
        n('batch', 'Batch size', 1, 32, 1),
        n('lr0', 'Initial learning rate', .000001, .1, .0001),
        n('lrf', 'Final learning rate (fraction)', .000001, 1, .001),
        n('warmup_epochs', 'Warmup epochs', 0, 15, .5),
        n('momentum', 'Momentum', 0, .999, .001),
        n('weight_decay', 'Weight decay', 0, .1, .0001),
        n('patience', 'Early-stop patience', 1, 100, 1, 'Stop when no progress for this many epochs'),
      ])}
      <div className="fields">
        <label className="field">Optimizer<select value={options.optimizer} onChange={event => set('optimizer', event.target.value as TrainingOptions['optimizer'])}>
          <option>SGD</option><option>Adam</option><option>AdamW</option></select></label>
        <label className="field">Learning rate schedule<select value={options.cos_lr ? 'cosine' : 'linear'} onChange={event => set('cos_lr', event.target.value === 'cosine')}>
          <option value="linear">Linear</option><option value="cosine">Cosine</option></select></label>
      </div>
    </Section>

    <Section num={5} title="Loss weights" summary={`box ${options.box} · cls ${options.cls} · dfl ${options.dfl}`}>
      {num([
        n('box', 'Box loss', .01, 20, .1, 'How much box position matters'),
        n('cls', 'Classification loss', .01, 10, .1, 'Raise for many similar classes'),
        n('dfl', 'Distribution focal loss', .01, 10, .1),
      ])}
    </Section>

    <Section num={6} title="Augmentation" summary="Flips, color, mosaic and more">
      {num([
        n('fliplr', 'Horizontal flip (probability)', 0, 1, .05),
        n('flipud', 'Vertical flip (probability)', 0, 1, .05),
        n('degrees', 'Rotation (degrees)', 0, 90, 1),
        n('translate', 'Translate', 0, .5, .05),
        n('scale', 'Scale', 0, 1, .05),
        n('shear', 'Shear (degrees)', 0, 30, 1),
        n('perspective', 'Perspective', 0, .001, .0001),
        n('hsv_h', 'Hue', 0, .5, .005),
        n('hsv_s', 'Saturation', 0, 1, .05),
        n('hsv_v', 'Brightness', 0, 1, .05),
        n('mosaic', 'Mosaic', 0, 1, .05),
        n('mixup', 'Mixup', 0, 1, .05),
        n('copy_paste', 'Copy-paste', 0, 1, .05),
        n('erasing', 'Random erasing (cutout)', 0, .9, .05),
        n('close_mosaic', 'Turn mosaic off in last N epochs', 0, 100, 1),
      ])}
    </Section>

    <Section num={7} title="Validation thresholds" summary={`IoU ${options.iou} · max ${options.max_det}`}>
      {num([
        n('iou', 'NMS IoU threshold', .1, .95, .05, 'Overlap at which duplicate boxes merge'),
        n('max_det', 'Max detections per image', 1, 1000, 1),
      ])}
      <p className="small muted">Tracked metrics: precision, recall, mAP50 and mAP50–95. You choose the confidence threshold when testing.</p>
    </Section>

    <Section num={8} title="Hardware and runtime" summary={`Up to ${options.max_minutes} min`}>
      {num([n('max_minutes', 'Time limit (minutes)', 1, 240, 1, 'Training stops with an error when this is reached')])}
      <p className="small muted"><Icon name="cpu" /> Runs on your workspace’s training worker (CPU).</p>
    </Section>

    <Section num={9} title="Checkpoints and outputs" summary="Best and last .pt">
      {num([n('save_period', 'Also save every N epochs', 0, 100, 1, '0 saves only the best and last')])}
      <p className="small muted">Output: PyTorch weights (best.pt and last.pt) you can download in the Use step.</p>
    </Section>
  </section>;
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
    queued: 'Waiting to start', running: ['Getting your images ready', 'Your model is learning', 'Checking how well it works'][phase],
    succeeded: 'Your model is ready', failed: 'Training did not finish', cancelled: 'Training stopped',
  }[job.status];

  const subline = active
    ? <>{eta && eta > 0 ? <>{formatEta(eta)} left. </> : job.status === 'queued' ? 'Waiting for the trainer to pick this up. ' : ''}You can close this page.<br />Training keeps running in your workspace.</>
    : done ? 'Test it on new photos to see how well it finds your objects.'
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
        <ol className="phases">
          {['Getting your images ready', 'Learning from your images', 'Checking how well it works', 'Ready to use'].map((label, index) => {
            const state = done || index < phase ? 'done' : active && index === phase ? 'now' : '';
            return <li key={label} className={state}><span className="mark">{state === 'done' && <Icon name="check" />}</span>{label}</li>;
          })}
        </ol>
      </div>
    </section>

    <section className="card quality" aria-label="Model quality">
      <header><h2>{done ? 'How good is it?' : 'How good is it so far?'}</h2>
        {score !== null && <b>{QUALITY[qualityBand(score)]}</b>}</header>
      {score === null ? <p className="muted">{active ? 'A first score appears after the model has learned for a little while.' : 'No score is available for this run.'}</p> : <>
        <div className="q-track" role="meter" aria-label="Model quality" aria-valuemin={0} aria-valuemax={100}
          aria-valuenow={Math.round(score * 100)} aria-valuetext={QUALITY[qualityBand(score)]}>
          <span /><span /><span /><span />
          <i className="q-marker" style={{ left: `${qualityPosition(score)}%` }} />
        </div>
        <div className="q-labels">{QUALITY.map((label, index) => <span key={label} className={index === qualityBand(score) ? 'on' : ''}>{label}</span>)}</div>
        <p className="muted small">{active ? 'It will keep improving until training finishes.' : job.evaluation ? 'Measured on test photos the model never saw during training.' : 'Measured on validation photos.'}</p>
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
        {details ? 'Hide technical details' : 'See technical details'} <Icon name={details ? 'chevronDown' : 'chevron'} />
      </button>
    </div>

    {details && <section className="card tech" aria-label="Technical details">
      <dl className="metrics">
        <div className="metric"><dt>Status</dt><dd style={{ fontSize: '1rem', textTransform: 'capitalize' }}>{job.status}</dd></div>
        <div className="metric"><dt>Epoch</dt><dd>{epoch || '—'}{epochs ? ` / ${epochs}` : ''}</dd></div>
        <div className="metric"><dt>mAP50–95</dt><dd>{percent(score, 1)}</dd></div>
        {job.evaluation && <>
          <div className="metric"><dt>mAP50</dt><dd>{percent(job.evaluation['metrics/mAP50(B)'], 1)}</dd></div>
          <div className="metric"><dt>Precision</dt><dd>{percent(precision, 1)}</dd></div>
          <div className="metric"><dt>Recall</dt><dd>{percent(recall, 1)}</dd></div>
          {f1 !== undefined && <div className="metric"><dt>F1</dt><dd>{percent(f1, 1)}</dd></div>}
        </>}
      </dl>
      <div className="table-wrap"><table className="data"><tbody>
        <tr><th scope="row">Version</th><td>{job.version_name || '—'}</td></tr>
        <tr><th scope="row">Started</th><td>{new Date(job.created_at).toLocaleString()}</td></tr>
        {job.finished_at && <tr><th scope="row">Finished</th><td>{new Date(job.finished_at).toLocaleString()}</td></tr>}
        <tr><th scope="row">Dataset revision</th><td>{job.dataset_revision}</td></tr>
        {job.options && <tr><th scope="row">Settings</th><td>
          {job.options.preset && job.options.preset !== 'custom' ? `${job.options.preset} preset · ` : ''}
          YOLO11{(job.options.model_size ?? 'n').toUpperCase()} · {job.options.imgsz}px · batch {job.options.batch} · {job.options.optimizer}
          {job.options.cos_lr ? ' (cosine)' : ''} · {job.options.epochs} epochs · seed {job.options.seed}
        </td></tr>}
        {job.notes && <tr><th scope="row">Notes</th><td>{job.notes}</td></tr>}
      </tbody></table></div>
      {done && <div className="row">
        <a className="btn ghost small" href={checkpointUrl(orgId, datasetId, job.id)}><Icon name="download" /> best.pt</a>
        <a className="btn ghost small" href={checkpointUrl(orgId, datasetId, job.id, 'last')}><Icon name="download" /> last.pt</a>
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

function Readiness({ project }: { project: Project }) {
  const total = project.photos.length;
  const empty = project.photos.filter(photo => photo.reviewed && !photo.boxes.length).length;
  const unlabeled = total - project.reviewed;
  const used = project.labels.filter(label => (project.labelCounts[label] ?? 0) > 0 || project.classes.includes(label));
  const good = used.filter(label => project.kindOf(label) === 'good').reduce((sum, label) => sum + (project.labelCounts[label] ?? 0), 0);
  const bad = used.filter(label => project.kindOf(label) === 'defect').reduce((sum, label) => sum + (project.labelCounts[label] ?? 0), 0);
  type Item = { state: 'ok' | 'warn' | 'bad'; text: ReactNode };
  const items: Item[] = [
    unlabeled ? { state: 'bad', text: <><b>{unlabeled} photos are not labeled yet.</b> Go back to Label and finish them.</> }
      : { state: 'ok', text: <>All {total} photos are labeled.</> },
    ...used.map((label): Item => {
      const count = project.labelCounts[label] ?? 0;
      return count < 2 ? { state: 'bad', text: <><b>{label}</b>: only in {count} photo{count === 1 ? '' : 's'}. Needs at least 2.</> }
        : count < 10 ? { state: 'warn', text: <><b>{label}</b>: in {count} photos. Training works, but 10+ gives much better results.</> }
          : { state: 'ok', text: <><b>{label}</b>: in {count} photos.</> };
    }),
  ];
  if (project.passFail) {
    items.push(good && bad && Math.min(good, bad) * 2 >= Math.max(good, bad)
      ? { state: 'ok', text: <>Good and defective examples are balanced ({good} good, {bad} defective).</> }
      : { state: 'warn', text: <>Unbalanced: {good} good vs {bad} defective. Try to have about the same number of each.</> });
  }
  items.push(empty ? { state: 'ok', text: <>{empty} empty photo{empty === 1 ? '' : 's'} teach the model what to ignore.</> }
    : { state: 'warn', text: <>No empty photos. Adding 2–5 photos with nothing to label reduces false alarms.</> });

  return <section className="card explain">
    <div className="fields" style={{ gridTemplateColumns: '1.2fr 1fr', gap: '1.5rem', alignItems: 'start' }}>
      <div className="stack" style={{ gap: '.7rem' }}>
        <h2>Before you start</h2>
        <ul className="checklist">{items.map((item, index) => <li key={index} className={item.state}>
          <span className="mark"><Icon name={item.state === 'ok' ? 'check' : item.state === 'warn' ? 'alert' : 'close'} /></span><span>{item.text}</span>
        </li>)}</ul>
      </div>
      <div className="stack" style={{ gap: '.7rem' }}>
        <h2>What happens when you press Start</h2>
        <ol className="how-draw" style={{ fontSize: '.95rem' }}>
          <li>We put a few of your photos <b>aside</b> for checking.</li>
          <li>The model <b>studies the rest</b> over and over, learning from your boxes.</li>
          <li>We <b>test it on the photos it didn't study</b> and show the score as Low, OK, Good or Great.</li>
        </ol>
        <p className="small muted">A low score usually means it needs more photos. It doesn't mean you did something wrong.</p>
      </div>
    </div>
  </section>;
}
