import { navigate } from '../../ui/navigation';
import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';

import { useWorkspace } from '../../context/WorkspaceContext';
import {
  activateProgram, captureGolden, deleteProgram, listProgramVersions, openProgram, saveProgram, testProgramDraft,
  type InspectionProgram, type InspectionRun, type Zone,
} from '../../services/api/inspectionPrograms';
import {
  listCompletedJobs, openTrainingDataset, trainingPhotoUrl, type TrainingJob,
} from '../../services/api/trainingDatasets';
import { Icon } from '../../ui/Icon';
import { ErrorBox, Loading, errorText, percent, projectHref, timeAgo, useObjectUrl, useToast } from '../../ui/common';
import { CameraCapture, versionName } from '../ModelTester';
import { BoardOverlay, DECISION_INFO, DecisionBadge, ZoneResultTable, toJpeg } from './inspectionUi';

type Tab = 'setup' | 'test';
type Point = { x: number; y: number };

const clamp = (value: number) => Math.min(1, Math.max(0, value));
const round = (value: number) => Math.round(value * 1000) / 1000;

export function ProgramEditor({ programId }: { programId: string }) {
  const { org, canEdit } = useWorkspace();
  const orgId = org!.org_id;
  const canPublish = org?.role === 'owner' || org?.role === 'admin';
  const toast = useToast();
  const [program, setProgram] = useState<InspectionProgram | null>(null);
  const [models, setModels] = useState<TrainingJob[]>([]);
  const [layoutUrl, setLayoutUrl] = useState('');
  const [layoutFile, setLayoutFile] = useState<File | null>(null);
  const [loadError, setLoadError] = useState('');
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState('');
  const [versions, setVersions] = useState<number[]>([]);
  const [rollbackRevision, setRollbackRevision] = useState('');
  const [error, setError] = useState('');
  const [tab, setTab] = useState<Tab>('setup');
  const [drawing, setDrawing] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [run, setRun] = useState<InspectionRun | null>(null);
  const [runImage, setRunImage] = useState<Blob | null>(null);
  const localLayout = useObjectUrl(layoutFile);
  const runUrl = useObjectUrl(runImage);
  const fileInput = useRef<HTMLInputElement>(null);

  /* ---------- Load ---------- */

  useEffect(() => {
    const controller = new AbortController();
    openProgram(orgId, programId, controller.signal).then(async loaded => {
      setProgram(loaded);
      if (canPublish) listProgramVersions(orgId, programId, controller.signal).then(setVersions).catch(cause => {
        if (!controller.signal.aborted) setError(errorText(cause, 'Could not load published revisions.'));
      });
      setSelected(loaded.zones[0]?.id ?? null);
      const [jobs, dataset] = await Promise.all([
        listCompletedJobs(orgId, loaded.dataset_id, controller.signal).catch(() => []),
        openTrainingDataset(orgId, loaded.dataset_id, controller.signal).catch(() => null),
      ]);
      setModels(jobs);
      const first = dataset?.photos[0];
      if (first) setLayoutUrl(trainingPhotoUrl(orgId, loaded.dataset_id, first.id));
      if (!loaded.zones.length) setDrawing(true);
    }).catch(cause => {
      if (!controller.signal.aborted) setLoadError(errorText(cause, 'Could not open this program.'));
    });
    return () => controller.abort();
  }, [orgId, programId, canPublish]);

  useEffect(() => { if (program) document.title = `${program.name} · Vision Studio`; }, [program?.name]);

  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  /* ---------- Editing ---------- */

  function change(update: (current: InspectionProgram) => InspectionProgram) {
    setProgram(current => current && update(current));
    setDirty(true);
    setError('');
  }

  function updateZone(id: string, update: (zone: Zone) => Zone) {
    change(current => ({ ...current, zones: current.zones.map(zone => zone.id === id ? update(zone) : zone) }));
  }

  function addZone(start: Point, end: Point) {
    const zone: Zone = {
      id: crypto.randomUUID(),
      name: `Zone ${(program?.zones.length ?? 0) + 1}`,
      x1: round(Math.min(start.x, end.x)), y1: round(Math.min(start.y, end.y)),
      x2: round(Math.max(start.x, end.x)), y2: round(Math.max(start.y, end.y)),
      expected: {}, critical: true,
    };
    change(current => ({ ...current, zones: [...current.zones, zone] }));
    setSelected(zone.id);
    setDrawing(false);
  }

  function removeZone(id: string) {
    change(current => ({ ...current, zones: current.zones.filter(zone => zone.id !== id) }));
    if (selected === id) setSelected(null);
  }

  async function save(): Promise<InspectionProgram | null> {
    if (!program || saving) return null;
    setSaving(true);
    setError('');
    try {
      const { revision } = await saveProgram(orgId, program);
      const saved = { ...program, revision };
      setProgram(saved);
      setDirty(false);
      return saved;
    } catch (cause) {
      setError(errorText(cause, 'Could not save the program.'));
      return null;
    } finally {
      setSaving(false);
    }
  }

  async function golden() {
    if (!program || busy) return;
    const source = layoutFile ?? layoutUrl;
    if (!source) { setError('Choose a photo of a good board first.'); return; }
    setBusy('golden');
    setError('');
    try {
      const saved = dirty ? await save() : program;
      if (!saved) return;
      const layout = await captureGolden(orgId, saved.id, await toJpeg(source));
      change(current => ({
        ...current,
        zones: current.zones.map(zone => ({ ...zone, expected: layout.expected[zone.id] ?? {} })),
      }));
      const total = Object.values(layout.expected).reduce((sum, counts) => sum + Object.values(counts).reduce((a, b) => a + b, 0), 0);
      toast(`Golden board captured: ${total} parts found. Check the counts, then save.`);
      if (layout.outside) setError(`${layout.outside} detected parts are outside every zone. Draw zones around them if they matter.`);
    } catch (cause) {
      setError(errorText(cause, 'Could not capture the golden board.'));
    } finally {
      setBusy('');
    }
  }

  async function inspect(image: Blob) {
    if (!program || busy) return;
    setBusy('inspect');
    setError('');
    try {
      const saved = dirty ? await save() : program;
      if (!saved) return;
      const jpeg = await toJpeg(image);
      const result = await testProgramDraft(orgId, saved.id, saved.revision, jpeg);
      setRunImage(jpeg);
      setRun(result);
    } catch (cause) {
      setError(errorText(cause, 'Could not inspect this board.'));
    } finally {
      setBusy('');
    }
  }

  async function activate(action: 'publish' | 'rollback') {
    if (!program || busy || saving) return;
    if (action === 'rollback' && !rollbackRevision) return;
    setBusy(action);
    setError('');
    try {
      const saved = action === 'publish' && dirty ? await save() : program;
      if (!saved) return;
      const revision = action === 'publish' ? saved.revision : Number(rollbackRevision);
      await activateProgram(orgId, program.id, revision, action);
      setProgram(current => current && { ...current, published_revision: revision });
      setVersions(current => [...new Set([revision, ...current])].sort((a, b) => b - a));
      setRollbackRevision('');
      toast(`Revision ${revision} is live`);
    } catch (cause) {
      setError(errorText(cause, 'Could not change the live revision.'));
    } finally {
      setBusy('');
    }
  }

  function changeTab(next: Tab) {
    setTab(next);
    setRun(null);
    setRunImage(null);
  }

  async function remove() {
    if (!program || !window.confirm(`Archive “${program.name}”? Its logged results will stay in Results and review.`)) return;
    try {
      await deleteProgram(orgId, program.id);
      navigate('/programs');
    } catch (cause) {
      setError(errorText(cause, 'Could not archive the program.'));
    }
  }

  /* ---------- Render ---------- */

  if (loadError) return <main className="page narrow"><ErrorBox message={loadError} /><a className="btn ghost" href="/programs"><Icon name="back" /> All programs</a></main>;
  if (!program) return <main className="page"><Loading label="Opening program…" /></main>;

  const editing = canEdit && !saving && !busy;
  const hasExpectedCounts = program.zones.some(zone => Object.keys(zone.expected).length > 0);
  const steps = [
    { label: 'Choose a model', done: !!program.model_job_id },
    { label: 'Draw zones', done: program.zones.length > 0 },
    { label: 'Golden layout', done: hasExpectedCounts },
    { label: 'Publish for inspections', done: !!program.published_revision },
  ];
  const ready = steps.slice(0, 3).every(step => step.done);
  const boardSrc = tab !== 'setup' && run && runUrl ? runUrl : localLayout || layoutUrl;

  return <main className="page wide">
    <header className="page-head">
      <div style={{ minWidth: 0, flex: '1 1 320px' }}>
        <a className="crumb-link" href="/programs"><Icon name="back" /> Inspection programs</a>
        <input className="title-input" aria-label="Program name" value={program.name} maxLength={80} disabled={!editing}
          onChange={event => change(current => ({ ...current, name: event.target.value }))} />
        <p className="small muted"><Icon name="grid" /> Project: <a href={projectHref(orgId, program.dataset_id, 'label')}>open labels</a>
          {program.updated_at && <> · saved {timeAgo(program.updated_at)}</>}</p>
        <p className="small muted">Draft revision {program.revision} · {program.published_revision ? `Live revision ${program.published_revision}` : 'Unpublished'}</p>
      </div>
      {canEdit && <div className="row">
        <span className="save-state">{saving ? 'Saving…' : dirty ? <><Icon name="clock" /> Unsaved changes</> : <><Icon name="check" /> Saved</>}</span>
        <button type="button" className="btn" disabled={!dirty || saving || !!busy} onClick={() => void save()}><Icon name="save" /> Save draft</button>
        <button type="button" className="icon-btn" aria-label="Archive program" title="Archive program" disabled={!!busy || saving} onClick={() => void remove()}><Icon name="trash" /></button>
      </div>}
    </header>

    <ol className="setup-steps" aria-label="Program setup">
      {steps.map((step, index) => <li key={step.label} className={step.done ? 'done' : ''}>
        <span className="n">{step.done ? <Icon name="check" /> : index + 1}</span>{step.label}
      </li>)}
    </ol>

    {error && <ErrorBox message={error} />}

    <div className="program-layout">
      <section className="card board-card">
        <div className="canvas-tools">
          {tab === 'setup' && editing && <button type="button" className={`btn small ${drawing ? '' : 'ghost'}`} aria-pressed={drawing}
            onClick={() => setDrawing(value => !value)}><Icon name="plus" /> {drawing ? 'Drag on the photo…' : 'Draw a zone'}</button>}
          {tab !== 'setup' && run && <span className="row small"><DecisionBadge decision={run.decision} /> Draft test</span>}
          <span className="spacer" />
          {tab === 'setup' && <>
            <button type="button" className="btn ghost small" onClick={() => fileInput.current?.click()}><Icon name="image" /> Layout photo</button>
            <input ref={fileInput} type="file" accept="image/*" hidden onChange={event => {
              setLayoutFile(event.target.files?.[0] ?? null);
              event.target.value = '';
            }} />
          </>}
        </div>
        {boardSrc ? <ZoneCanvas src={boardSrc} program={program} drawing={drawing && tab === 'setup' && !!editing}
          selected={selected} onSelect={setSelected} onDraw={addZone}
          run={tab === 'setup' ? null : run} />
          : <div className="empty"><Icon name="image" /><p className="muted">Choose a layout photo of the board to draw zones on.</p></div>}
        <p className="small muted"><Icon name="info" /> {tab === 'setup'
          ? 'Use a photo from the fixed camera. Zones are stored as fractions of the photo, so they fit every photo from the same setup.'
          : 'Green zones passed, orange failed, dashed need review. Thin boxes are what the model found; dashed boxes are unsure.'}</p>
      </section>

      <aside className="panel-stack program-panel">
        <div className="seg" role="tablist" aria-label="Program panel">
          <button type="button" role="tab" aria-selected={tab === 'setup'} aria-pressed={tab === 'setup'} disabled={!!busy || saving} onClick={() => changeTab('setup')}><Icon name="sliders" /> Set up</button>
          {canEdit && <button type="button" role="tab" aria-selected={tab === 'test'} aria-pressed={tab === 'test'}
            disabled={!!busy || saving} onClick={() => changeTab('test')}>Test draft</button>}

        </div>

        {tab === 'setup' ? <>
          <section className="card side-card">
            <h3><span><Icon name="cpu" /> 1. Model</span></h3>
            {program.model_job_id && !models.some(model => model.id === program.model_job_id) &&
              <div className="notice small"><Icon name="cpu" /><span>Using model <code>{program.model_job_id.slice(0, 8)}</code>. It is not in the project's model list any more; choose another below if needed.</span></div>}
            {models.length === 0 ? <div className="notice small"><Icon name="info" /><span>No trained model yet. <a href={projectHref(orgId, program.dataset_id, 'train')}>Train one</a> first.</span></div>
              : <div className="versions">{models.map(model => <button key={model.id} type="button" className="version"
                aria-pressed={program.model_job_id === model.id} disabled={!editing}
                onClick={() => change(current => ({ ...current, model_job_id: model.id }))}>
                <Icon name="cpu" />
                <span><b>{versionName(model, models)}</b><small>{model.finished_at ? timeAgo(model.finished_at) : ''}</small></span>
                <span className="score">{percent(model.evaluation?.['metrics/mAP50-95(B)'])}</span>
              </button>)}</div>}
          </section>

          <section className="card side-card">
            <h3><span><Icon name="target" /> Thresholds</span></h3>
            <label className="field">Confidence: {Math.round(program.confidence * 100)}%
              <input type="range" min={5} max={95} step={5} value={Math.round(program.confidence * 100)} disabled={!editing}
                onChange={event => {
                  const confidence = Number(event.target.value) / 100;
                  change(current => ({ ...current, confidence, review_margin: Math.min(current.review_margin, confidence - .05) }));
                }} />
              <small>Lower finds more parts (fewer missed defects) but may count noise. Higher is stricter.</small>
            </label>
            <label className="field">Review band: {Math.round(program.review_margin * 100)}%
              <input type="range" min={0} max={Math.min(50, Math.round(program.confidence * 100) - 5)} step={5}
                value={Math.round(program.review_margin * 100)} disabled={!editing}
                onChange={event => change(current => ({ ...current, review_margin: Number(event.target.value) / 100 }))} />
              <small>Parts found with {Math.round((program.confidence - program.review_margin) * 100)}–{Math.round(program.confidence * 100)}% confidence send the board to a person for review.</small>
            </label>
          </section>

          <section className="card side-card">
            <h3><span><Icon name="grid" /> 2. Zones</span><span className="chip plain">{program.zones.length}</span></h3>
            {program.zones.length === 0 && <p className="small muted">Click <b>Draw a zone</b> and drag around the area to check, such as where a shipping label should be.</p>}
            <ul className="zone-list">{program.zones.map((zone, index) => <ZoneRow key={zone.id} zone={zone} index={index}
              classes={program.classes} defects={program.defect_classes} open={selected === zone.id} canEdit={!!editing}
              onOpen={() => setSelected(selected === zone.id ? null : zone.id)}
              onChange={update => updateZone(zone.id, update)} onRemove={() => removeZone(zone.id)} />)}</ul>
          </section>

          <section className="card side-card">
            <h3><span><Icon name="star" /> 3. Golden layout</span></h3>
            <p className="small muted">Show the model a known-good board. It counts what it finds in each zone and fills in the expected numbers for you.</p>
            <button type="button" className="btn block" disabled={!canEdit || !program.model_job_id || !program.zones.length || !!busy}
              onClick={() => void golden()}><Icon name="star" /> {busy === 'golden' ? 'Counting parts…' : 'Capture golden board from layout photo'}</button>
            {!program.model_job_id && <p className="small muted">Choose a model first.</p>}
          </section>

          {canPublish && <section className="card side-card">
            <h3><span><Icon name="flag" /> Publish program</span></h3>
            <p className="small muted">Test the draft on a reference photo before publishing it for inspections.</p>
            <button type="button" className="btn" disabled={!ready || !!busy || saving || (!dirty && program.revision === program.published_revision)}
              onClick={() => void activate('publish')}>{busy === 'publish' ? 'Publishing…' : 'Publish draft'}</button>
            {versions.some(revision => revision !== program.published_revision) && <div className="row">
              <select className="input" aria-label="Revision to restore" value={rollbackRevision}
                disabled={!!busy || saving} onChange={event => setRollbackRevision(event.target.value)}>
                <option value="">Choose a published revision</option>
                {versions.filter(revision => revision !== program.published_revision).map(revision =>
                  <option key={revision} value={revision}>Revision {revision}</option>)}
              </select>
              <button type="button" className="btn ghost" disabled={!rollbackRevision || !!busy || saving}
                onClick={() => {
                  if (window.confirm(`Make revision ${rollbackRevision} live?`)) void activate('rollback');
                }}>Restore live revision</button>
            </div>}
          </section>}
        </> : <DraftTestPanel ready={ready} busy={!!busy || saving} run={run} onInspect={image => void inspect(image)} />}
        {canEdit && program.published_revision && <a className="btn ghost" href={`/operator/${program.id}`}>
          <Icon name="camera" /> Open operator screen
        </a>}
      </aside>
    </div>
  </main>;
}

/* ---------- Zone list row ---------- */

function ZoneRow({ zone, index, classes, defects, open, canEdit, onOpen, onChange, onRemove }: {
  zone: Zone; index: number; classes: string[]; defects: string[]; open: boolean; canEdit: boolean;
  onOpen: () => void; onChange: (update: (zone: Zone) => Zone) => void; onRemove: () => void;
}) {
  const expected = Object.entries(zone.expected);
  const unused = classes.filter(label => !(label in zone.expected));
  const setCount = (label: string, count: number) => onChange(current => {
    const next = { ...current.expected };
    if (Number.isFinite(count) && count >= 0) next[label] = Math.min(500, Math.round(count));
    return { ...current, expected: next };
  });
  const dropClass = (label: string) => onChange(current => {
    const { [label]: _removed, ...rest } = current.expected;
    return { ...current, expected: rest };
  });
  return <li className={`zone-row${open ? ' open' : ''}`}>
    <button type="button" className="zone-row-head" onClick={onOpen} aria-expanded={open}>
      <span className="box-n">{index + 1}</span>
      <span className="spacer"><b>{zone.name}</b>
        <small>{expected.length ? expected.map(([label, count]) => `${count} × ${label}`).join(', ') : 'No expected parts yet'}</small></span>
      {!zone.critical && <span className="kind-plain">Not critical</span>}
      <Icon name={open ? 'chevronDown' : 'chevron'} />
    </button>
    {open && <div className="zone-row-body">
      <label className="field">Zone name<input value={zone.name} maxLength={60} disabled={!canEdit}
        onChange={event => onChange(current => ({ ...current, name: event.target.value }))} /></label>
      <label className="check"><input type="checkbox" checked={zone.critical} disabled={!canEdit}
        onChange={event => onChange(current => ({ ...current, critical: event.target.checked }))} />
        Critical zone <span className="small muted">(a problem here fails the board; otherwise it goes to review)</span></label>
      <div className="field"><span>Expected in this zone</span>
        {expected.length === 0 && <small>Capture a golden board, or add parts by hand.</small>}
        <ul className="expected-list">{expected.map(([label, count]) => <li key={label}>
          <span className="spacer">{label}{defects.includes(label) && <span className="kind defect"><Icon name="alert" />Defect</span>}</span>
          <input type="number" min={0} max={500} value={count} disabled={!canEdit} aria-label={`Expected ${label}`}
            onChange={event => setCount(label, event.target.valueAsNumber)} />
          {canEdit && <button type="button" className="icon-btn" aria-label={`Remove ${label}`} onClick={() => dropClass(label)}><Icon name="close" /></button>}
        </li>)}</ul>
        {canEdit && unused.length > 0 && <select value="" aria-label="Add expected part" onChange={event => { if (event.target.value) setCount(event.target.value, 1); }}>
          <option value="">+ Add a part…</option>
          {unused.map(label => <option key={label} value={label}>{label}</option>)}
        </select>}
      </div>
      {canEdit && <button type="button" className="btn ghost small" onClick={onRemove}><Icon name="trash" /> Delete zone</button>}
    </div>}
  </li>;
}

/* ---------- Inspect panel ---------- */

function DraftTestPanel({ ready, busy, run, onInspect }: {
  ready: boolean; busy: boolean; run: InspectionRun | null; onInspect: (image: Blob) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [camera, setCamera] = useState(false);
  if (!ready) return <div className="notice"><Icon name="info" /><span>Choose a model, draw zones, and set expected counts to test the draft.</span></div>;
  return <>
    <section className="card side-card">
      <h3><span><Icon name="camera" /> Test a reference photo</span></h3>
      <div className="row">
        <button type="button" className="btn" disabled={busy} onClick={() => input.current?.click()}><Icon name="upload" /> {busy ? 'Inspecting…' : 'Upload photo'}</button>
        <button type="button" className="btn ghost" aria-pressed={camera} onClick={() => setCamera(value => !value)}><Icon name="camera" /> Camera</button>
      </div>
      <input ref={input} type="file" accept="image/*" hidden onChange={event => {
        const file = event.target.files?.[0];
        if (file) onInspect(file);
        event.target.value = '';
      }} />
      {camera && <CameraCapture busy={busy} demo={false} onCapture={onInspect} />}
      <p className="small muted">Draft tests stay out of inspection history.</p>
    </section>
    {run && <section className="card side-card result-card" aria-live="polite">
      <DecisionBadge decision={run.decision} large />
      <p className="small">{DECISION_INFO[run.decision].text}</p>
      <ZoneResultTable results={run.zone_results} />
      <p className="small muted">Revision {run.program_snapshot?.revision} · Confidence threshold {Math.round(run.confidence * 100)}%.</p>
    </section>}
  </>;
}

/* ---------- Zone canvas ---------- */

function ZoneCanvas({ src, program, drawing, selected, onSelect, onDraw, run }: {
  src: string; program: InspectionProgram; drawing: boolean; selected: string | null;
  onSelect: (id: string) => void; onDraw: (start: Point, end: Point) => void; run: InspectionRun | null;
}) {
  const area = useRef<HTMLDivElement>(null);
  const [draft, setDraft] = useState<{ start: Point; end: Point } | null>(null);
  const labels = useMemo(() => program.classes, [program.classes]);

  function point(event: ReactPointerEvent): Point {
    const rect = area.current!.getBoundingClientRect();
    return { x: clamp((event.clientX - rect.left) / rect.width), y: clamp((event.clientY - rect.top) / rect.height) };
  }

  return <div ref={area} className={`zone-canvas${drawing ? ' drawing' : ''}`}
    onPointerDown={event => {
      if (!drawing || event.button !== 0) return;
      event.currentTarget.setPointerCapture(event.pointerId);
      const start = point(event);
      setDraft({ start, end: start });
    }}
    onPointerMove={event => { if (draft) { const end = point(event); setDraft(value => value && { ...value, end }); } }}
    onPointerUp={event => {
      if (!draft) return;
      const end = point(event);
      if (Math.abs(end.x - draft.start.x) > .02 && Math.abs(end.y - draft.start.y) > .02) onDraw(draft.start, end);
      setDraft(null);
    }}
    onLostPointerCapture={() => setDraft(null)}>
    <BoardOverlay src={src} zones={run?.program_snapshot?.zones.map(({ region, ...zone }) => ({ ...zone, ...region })) ?? program.zones} results={run?.zone_results} detections={run?.detections}
      labels={run?.program_snapshot?.classes ?? labels} confidence={run?.confidence ?? program.confidence} selectedZone={selected} onZoneClick={drawing ? undefined : onSelect} />
    {draft && <div className="zone draft" style={{
      left: `${Math.min(draft.start.x, draft.end.x) * 100}%`, top: `${Math.min(draft.start.y, draft.end.y) * 100}%`,
      width: `${Math.abs(draft.end.x - draft.start.x) * 100}%`, height: `${Math.abs(draft.end.y - draft.start.y) * 100}%`,
    }} />}
    {drawing && !draft && <div className="canvas-hint">Drag around one area of the board</div>}
  </div>;
}
