import { useEffect, useState } from 'react';

import { useWorkspace } from '../../context/WorkspaceContext';
import {
  listResultPrograms, listRuns, openRun, resultsCsvUrl, reviewRun, runImageUrl, sendRunToDataset,
  type Decision, type InspectionRun, type ResultProgram, type ReviewStatus, type RunCursor,
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

const PAGE_SIZE = 24;

function dayBoundary(day: string, end = false) {
  if (!day) return undefined;
  const date = new Date(`${day}T00:00:00`);
  if (!Number.isFinite(date.getTime())) return undefined;
  if (end) date.setDate(date.getDate() + 1);
  return date.toISOString();
}

function calendarDate(date: Date) {
  return [date.getFullYear(), date.getMonth() + 1, date.getDate()].map(value => String(value).padStart(2, '0')).join('-');
}

export function ResultsPage({ runId }: { runId?: string }) {
  const { org } = useWorkspace();
  const orgId = org!.org_id;
  const [view, setView] = useState<View>('review');
  const [programId, setProgramId] = useState('');
  const [programs, setPrograms] = useState<ResultProgram[]>([]);
  const [programError, setProgramError] = useState('');
  const [fromDay, setFromDay] = useState('');
  const [untilDay, setUntilDay] = useState('');
  const [pages, setPages] = useState<RunCursor[]>([]);
  const before = pages.at(-1);
  const invalidDates = Boolean(fromDay && untilDay && fromDay > untilDay);
  const filters = {
    ...VIEWS.find(item => item.key === view)!.filter,
    programId: programId || undefined,
    fromAt: dayBoundary(fromDay),
    untilAt: dayBoundary(untilDay, true),
  };
  const [runs, setRuns] = useState<InspectionRun[] | null>(null);
  const [error, setError] = useState('');
  const [version, setVersion] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setProgramError('');
    listResultPrograms(orgId, controller.signal).then(items => {
      if (!controller.signal.aborted) setPrograms(items);
    }).catch(cause => {
      if (!controller.signal.aborted) setProgramError(errorText(cause, 'Could not load programs.'));
    });
    return () => controller.abort();
  }, [orgId, version]);

  useEffect(() => {
    const controller = new AbortController();
    setRuns(null);
    setError('');
    if (invalidDates) return;
    listRuns(orgId, { ...filters, before, limit: PAGE_SIZE + 1 }, controller.signal).then(items => {
      if (!controller.signal.aborted) setRuns(items);
    }).catch(cause => {
      if (!controller.signal.aborted) setError(errorText(cause, 'Could not load results.'));
    });
    return () => controller.abort();
  }, [orgId, view, programId, fromDay, untilDay, before, invalidDates, version]);

  const visibleRuns = runs?.slice(0, PAGE_SIZE);
  const last = visibleRuns?.at(-1);
  const hasNext = (runs?.length ?? 0) > PAGE_SIZE && Boolean(last?.created_at);

  const [open, setOpen] = useState<InspectionRun | null>(null);

  // The detail is loaded by ID, so it stays open after a review moves it out of the current list.
  useEffect(() => {
    if (!runId) { setOpen(null); return; }
    const controller = new AbortController();
    openRun(orgId, runId, controller.signal).then(item => {
      if (!controller.signal.aborted) setOpen(item);
    }).catch(cause => {
      if (!controller.signal.aborted) setError(errorText(cause, 'Could not open this result.'));
    });
    return () => controller.abort();
  }, [orgId, runId, version]);
  const currentRun = open?.id === runId ? open : null;

  function recentDays(days: number) {
    const lastDay = new Date();
    const firstDay = new Date(lastDay);
    firstDay.setDate(firstDay.getDate() - days + 1);
    setFromDay(calendarDate(firstDay));
    setUntilDay(calendarDate(lastDay));
    setPages([]);
  }

  return <main className="page workspace-page">
    <header className="page-head">
      <div>
        <span className="eyebrow"><Icon name="flag" /> Object detection</span>
        <h1 style={{ marginTop: '.3rem' }}>Results and review</h1>
        <p>Every inspected board, with its photo. Check the unsure ones and send mistakes back to the project to retrain.</p>
      </div>
    </header>

    <section className="card review-filters" aria-label="Result filters">
      <div className="row">
        <div className="seg" role="group" aria-label="Show">
          {VIEWS.map(item => <button key={item.key} type="button" aria-pressed={view === item.key}
            onClick={() => { setView(item.key); setPages([]); }}>{item.label}</button>)}
        </div>
        <span className="spacer" />
        {!invalidDates && <a className="btn ghost" href={resultsCsvUrl(orgId, filters)} download>
          <Icon name="download" /> Export CSV
        </a>}
      </div>
      <div className="review-filter-fields">
        <label className="field">Program
          <select className="input" value={programId} onChange={event => { setProgramId(event.target.value); setPages([]); }}>
            <option value="">All programs</option>
            {programs.map(program => <option key={program.id} value={program.id}>{program.name}</option>)}
          </select>
        </label>
        <label className="field">From
          <input type="date" value={fromDay} max={untilDay || undefined}
            onChange={event => { setFromDay(event.target.value); setPages([]); }} />
        </label>
        <label className="field">To
          <input type="date" value={untilDay} min={fromDay || undefined}
            onChange={event => { setUntilDay(event.target.value); setPages([]); }} />
        </label>
        {(programId || fromDay || untilDay) && <button className="btn ghost" type="button" onClick={() => {
          setProgramId(''); setFromDay(''); setUntilDay(''); setPages([]);
        }}>Clear filters</button>}
      </div>
      <div className="row" role="group" aria-label="Quick date filters">
        <button className="btn ghost small" type="button" onClick={() => recentDays(1)}>Today</button>
        <button className="btn ghost small" type="button" onClick={() => recentDays(7)}>Last 7 days</button>
      </div>
    </section>

    {invalidDates && <ErrorBox message="Choose an end date on or after the start date." />}
    {programError && <ErrorBox message={programError} onRetry={() => setVersion(value => value + 1)} />}
    {error && <ErrorBox message={error} onRetry={() => setVersion(value => value + 1)} />}
    {!runs && !error && !invalidDates && <Loading label="Loading results…" />}
    {visibleRuns?.length === 0 && !currentRun && <div className="empty">
      <span className="bubble"><Icon name="flag" /></span>
      <h2>{pages.length ? 'No results on this page' : view === 'review' && !programId && !fromDay && !untilDay ? 'Nothing waiting for review' : 'No matching results'}</h2>
      <p className="muted">{pages.length ? 'Go back to see newer results.' : 'Try a different view or date range.'}</p>
    </div>}

    {(Boolean(visibleRuns?.length) || currentRun) && <div className={`results-layout${currentRun ? ' with-detail' : ''}`}>
      <ul className="run-list">{visibleRuns?.map(run => <li key={run.id}>
        <a href={`/results/${run.id}`} aria-current={run.id === runId ? 'true' : undefined} className="run-row">
          <img src={runImageUrl(orgId, run.id)} alt="" loading="lazy" />
          <span className="spacer">
            <b>{run.program_name}</b>
            <small>{run.created_at ? timeAgo(run.created_at) : ''} · {REVIEW_LABEL[run.review_status]}</small>
            <small className="muted">{summarize(run)}</small>
          </span>
          <DecisionBadge decision={run.decision} />
        </a>
      </li>)}</ul>
      {currentRun && <RunDetail key={`${currentRun.id}-${currentRun.review_status}-${currentRun.sent_to_dataset_at}`} orgId={orgId} run={currentRun} onChanged={() => setVersion(value => value + 1)} />}
    </div>}

    {(pages.length > 0 || hasNext) && <nav className="review-pagination row" aria-label="Results pages">
      <button className="btn ghost" type="button" disabled={!pages.length}
        onClick={() => setPages(current => current.slice(0, -1))}>Previous</button>
      <span className="small muted" aria-live="polite">Page {pages.length + 1}</span>
      <button className="btn ghost" type="button" disabled={!runs || !hasNext} onClick={() => {
        const at = last?.created_at;
        if (last && at) setPages(current => [...current, { at, id: last.id }]);
      }}>Next</button>
    </nav>}
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
  const snapshot = run.program_snapshot;
  const [note, setNote] = useState(run.review_note);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

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
      <a className="icon-btn" href="/results" aria-label="Close"><Icon name="close" /></a>
    </div>
    <BoardOverlay src={runImageUrl(orgId, run.id)} zones={snapshot?.zones.map(({ region, ...zone }) => ({ ...zone, ...region })) ?? []} results={run.zone_results}
      detections={run.detections} labels={snapshot?.classes ?? []} confidence={run.confidence} />
    <p className="small muted">{snapshot ? `Program revision ${snapshot.revision}` : 'This run predates saved zone layouts.'}</p>
    <ZoneResultTable results={run.zone_results} />

    <div className="review-box">
      <h3><Icon name="eye" /> Was the model right?</h3>
      <p className="small muted">Your answer is logged. Wrong results are the best examples to train on next.</p>
      <label className="field">Note (optional)<input maxLength={400} value={note} disabled={!canEdit} placeholder="Example: The label was straight, but there was glare."
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
      {run.dataset_archived ? <p className="small muted">This project is archived.</p> : run.sent_to_dataset_at ? <p className="small"><Icon name="check" /> Added to the project {timeAgo(run.sent_to_dataset_at)}.
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
