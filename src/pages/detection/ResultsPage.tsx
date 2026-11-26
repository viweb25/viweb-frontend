import { useEffect, useState } from 'react';

import { useWorkspace } from '../../context/WorkspaceContext';
import {
  listPrograms, listRuns, openProgram, openRun, reviewRun, runImageUrl, sendRunToDataset,
  type Decision, type InspectionProgram, type InspectionRun, type ProgramSummary, type ReviewStatus,
} from '../../services/api/inspectionPrograms';
import { Icon } from '../../ui/Icon';
import { ErrorBox, Loading, errorText, projectHref, timeAgo, useToast } from '../../ui/common';
import { BoardOverlay, DECISION_INFO, DecisionBadge, REVIEW_LABEL, ZoneResultTable } from './inspectionUi';

type View = 'review' | 'all' | 'fail';

const VIEWS: { key: View; label: string; filter: { decision?: Decision; reviewStatus?: ReviewStatus } }[] = [
  { key: 'review', label: 'To review', filter: { reviewStatus: 'pending' } },
  { key: 'fail', label: 'Failed boards', filter: { decision: 'FAIL' } },
  { key: 'all', label: 'All results', filter: {} },
];

export function ResultsPage({ runId }: { runId?: string }) {
  const { org } = useWorkspace();
  const orgId = org!.org_id;
  const [view, setView] = useState<View>('review');
  const [programId, setProgramId] = useState('');
  const [programs, setPrograms] = useState<ProgramSummary[]>([]);
  const [runs, setRuns] = useState<InspectionRun[] | null>(null);
  const [error, setError] = useState('');
  const [version, setVersion] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    listPrograms(orgId, controller.signal).then(setPrograms).catch(() => undefined);
    return () => controller.abort();
  }, [orgId]);

  useEffect(() => {
    const controller = new AbortController();
    setRuns(null);
    setError('');
    const filter = VIEWS.find(item => item.key === view)!.filter;
    listRuns(orgId, { ...filter, programId: programId || undefined, limit: 100 }, controller.signal).then(setRuns).catch(cause => {
      if (!controller.signal.aborted) setError(errorText(cause, 'Could not load results.'));
    });
    return () => controller.abort();
  }, [orgId, view, programId, version]);

  const [open, setOpen] = useState<InspectionRun | null>(null);

  // The detail is loaded by ID, so it stays open after a review moves it out of the current list.
  useEffect(() => {
    if (!runId) { setOpen(null); return; }
    const controller = new AbortController();
    openRun(orgId, runId, controller.signal).then(setOpen).catch(cause => {
      if (!controller.signal.aborted) setError(errorText(cause, 'Could not open this result.'));
    });
    return () => controller.abort();
  }, [orgId, runId, version]);
  const total = runs?.length ?? 0;
  const passed = runs?.filter(run => run.decision === 'PASS').length ?? 0;

  return <main className="page wide">
    <header className="page-head">
      <div>
        <span className="eyebrow"><Icon name="flag" /> Object detection</span>
        <h1 style={{ marginTop: '.3rem' }}>Results and review</h1>
        <p>Every inspected board, with its photo. Check the unsure ones and send mistakes back to the project to retrain.</p>
      </div>
    </header>

    <div className="toolbar">
      <div className="seg" role="group" aria-label="Show">
        {VIEWS.map(item => <button key={item.key} type="button" aria-pressed={view === item.key} onClick={() => setView(item.key)}>{item.label}</button>)}
      </div>
      <select className="input" style={{ maxWidth: 280 }} aria-label="Program" value={programId} onChange={event => setProgramId(event.target.value)}>
        <option value="">All programs</option>
        {programs.map(program => <option key={program.id} value={program.id}>{program.name}</option>)}
      </select>
      <span className="spacer" />
      {runs && <span className="small muted">{total} shown · {passed} passed</span>}
    </div>

    {error && <ErrorBox message={error} onRetry={() => setVersion(value => value + 1)} />}
    {!runs && !error && <Loading label="Loading results…" />}
    {runs && runs.length === 0 && !open && <div className="empty">
      <span className="bubble"><Icon name={view === 'review' ? 'check' : 'flag'} /></span>
      <h2>{view === 'review' ? 'Nothing waiting for review' : 'No results yet'}</h2>
      <p className="muted">{view === 'review' ? 'Unsure results land here automatically.' : 'Inspect a board from an inspection program to see results here.'}</p>
      <a className="btn ghost" href="#/programs"><Icon name="layers" /> Inspection programs</a>
    </div>}

    {runs && (runs.length > 0 || open) && <div className={`results-layout${open ? ' with-detail' : ''}`}>
      <ul className="run-list">{runs.map(run => <li key={run.id}>
        <a href={`#/results/${run.id}`} aria-current={run.id === runId ? 'true' : undefined} className="run-row">
          <img src={runImageUrl(orgId, run.id)} alt="" loading="lazy" />
          <span className="spacer">
            <b>{run.program_name}</b>
            <small>{run.created_at ? timeAgo(run.created_at) : ''} · {REVIEW_LABEL[run.review_status]}</small>
            <small className="muted">{summarize(run)}</small>
          </span>
          <DecisionBadge decision={run.decision} />
        </a>
      </li>)}</ul>
      {open && <RunDetail key={`${open.id}-${open.review_status}-${open.sent_to_dataset_at}`} orgId={orgId} run={open} onChanged={() => setVersion(value => value + 1)} />}
    </div>}
  </main>;
}

function summarize(run: InspectionRun) {
  const failing = run.zone_results.filter(zone => zone.decision !== 'PASS');
  if (!failing.length) return `All ${run.zone_results.length} zones OK`;
  return failing.map(zone => `${zone.name}: ${DECISION_INFO[zone.decision].label.toLowerCase()}`).join(' · ');
}

function RunDetail({ orgId, run, onChanged }: { orgId: string; run: InspectionRun; onChanged: () => void }) {
  const { canEdit } = useWorkspace();
  const toast = useToast();
  const [program, setProgram] = useState<InspectionProgram | null>(null);
  const [note, setNote] = useState(run.review_note);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    openProgram(orgId, run.program_id, controller.signal).then(setProgram).catch(() => undefined);
    return () => controller.abort();
  }, [orgId, run.program_id]);

  async function act(action: () => Promise<unknown>, message: string) {
    setBusy(true);
    setError('');
    try {
      await action();
      toast(message);
      onChanged();
    } catch (cause) {
      setError(errorText(cause, 'Could not save.'));
    } finally {
      setBusy(false);
    }
  }

  return <section className="card run-detail" aria-label="Result details">
    <div className="row">
      <DecisionBadge decision={run.decision} large />
      <span className="spacer"><b>{run.program_name}</b><br /><small className="muted">{run.created_at && new Date(run.created_at).toLocaleString()}</small></span>
      <a className="icon-btn" href="#/results" aria-label="Close"><Icon name="close" /></a>
    </div>
    <BoardOverlay src={runImageUrl(orgId, run.id)} zones={program?.zones ?? []} results={run.zone_results}
      detections={run.detections} labels={program?.classes ?? []} confidence={run.confidence} />
    <ZoneResultTable results={run.zone_results} />

    <div className="review-box">
      <h3><Icon name="eye" /> Was the model right?</h3>
      <p className="small muted">Your answer is logged. Wrong results are the best examples to train on next.</p>
      <label className="field">Note (optional)<input maxLength={400} value={note} disabled={!canEdit} placeholder="e.g. bolt was there, glare on metal"
        onChange={event => setNote(event.target.value)} /></label>
      {canEdit && <div className="row">
        <button type="button" className="btn ghost" disabled={busy} aria-pressed={run.review_status === 'confirmed'}
          onClick={() => void act(() => reviewRun(orgId, run.id, 'confirmed', note), 'Marked as correct')}><Icon name="check" /> Yes, correct</button>
        <button type="button" className="btn ghost" disabled={busy} aria-pressed={run.review_status === 'corrected'}
          onClick={() => void act(() => reviewRun(orgId, run.id, 'corrected', note), 'Marked as wrong')}><Icon name="close" /> No, it was wrong</button>
      </div>}
      <p className="small"><b>Status:</b> {REVIEW_LABEL[run.review_status]}{run.reviewed_at && ` · ${timeAgo(run.reviewed_at)}`}</p>
    </div>

    <div className="review-box">
      <h3><Icon name="refresh" /> Teach the model with this photo</h3>
      {run.sent_to_dataset_at ? <p className="small"><Icon name="check" /> Added to the project {timeAgo(run.sent_to_dataset_at)}.
        {run.dataset_id && <> <a href={projectHref(orgId, run.dataset_id, 'label')}>Label it now</a>, then train again.</>}</p>
        : <>
          <p className="small muted">Adds the photo to the project with the model's boxes as suggestions. Correct them in Label, then train a new version.</p>
          {canEdit && <button type="button" className="btn" disabled={busy}
            onClick={() => void act(() => sendRunToDataset(orgId, run.id), 'Photo added to the project')}><Icon name="upload" /> Send to project for labeling</button>}
        </>}
    </div>
    {error && <ErrorBox message={error} />}
  </section>;
}
