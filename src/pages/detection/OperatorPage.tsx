import { navigate } from '../../ui/navigation';
import { useEffect, useRef, useState } from 'react';

import { useWorkspace } from '../../context/WorkspaceContext';
import { ApiRequestError } from '../../services/api/client';
import { inspectBoard, listPrograms, type InspectionRun, type ProgramSummary } from '../../services/api/inspectionPrograms';
import { Icon } from '../../ui/Icon';
import { ErrorBox, Loading, errorText, useObjectUrl } from '../../ui/common';
import { CameraCapture, type CameraStatus } from '../ModelTester';
import { BoardOverlay, DecisionBadge, toJpeg } from './inspectionUi';

const CAMERA_LABEL: Record<CameraStatus, string> = {
  off: 'Camera off', starting: 'Opening camera', ready: 'Camera ready', error: 'Camera unavailable',
};

const NEXT_ACTION = {
  PASS: 'Continue to the next board.',
  FAIL: 'Set this board aside and check the flagged zones.',
  REVIEW: 'Set this board aside for review.',
};

export function OperatorPage({ programId }: { programId?: string }) {
  const { org, canEdit } = useWorkspace();
  const [programs, setPrograms] = useState<ProgramSummary[] | null>(null);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!canEdit) return;
    const controller = new AbortController();
    setError('');
    setPrograms(null);
    listPrograms(org!.org_id, controller.signal).then(items => {
      if (!controller.signal.aborted) setPrograms(items.filter(item => item.published_revision));
    }).catch(cause => {
      if (!controller.signal.aborted) setError(errorText(cause, 'Could not load live programs.'));
    });
    return () => controller.abort();
  }, [org, canEdit, attempt]);

  const program = programs?.find(item => item.id === programId) ?? (!programId && programs?.length === 1 ? programs[0] : undefined);
  const reload = () => setAttempt(current => current + 1);

  return <main className="page wide">
    <header className="page-head"><div><h1>Run inspection</h1></div>
      <a className="btn ghost" href="/results"><Icon name="flag" /> Results and review</a>
    </header>
    {!canEdit ? <div className="notice">Your workspace role has read-only access to inspections.</div>
      : error ? <ErrorBox message={error} onRetry={reload} />
      : !programs ? <Loading label="Loading live programs…" />
      : !programs.length ? <div className="empty">
        <span className="bubble"><Icon name="layers" /></span>
        <h2>No published programs</h2>
        <p className="muted">A workspace owner or admin can publish an inspection program.</p>
        <a className="btn ghost" href="/programs">Inspection programs</a>
      </div> : <>
        {programId && !program && <ErrorBox message="That program is no longer available. Choose a live program." />}
        <label className="field operator-program">Active program
          <select className="input" value={program?.id ?? ''} onChange={event => {
            navigate(`/operator/${event.target.value}`);
          }}>
            {!program && <option value="" disabled>Choose a program</option>}
            {programs.map(item => <option key={item.id} value={item.id}>{item.published_name ?? item.name}</option>)}
          </select>
        </label>
        {program && <Station key={`${program.id}/${program.published_revision}`} orgId={org!.org_id} program={program} reload={reload} />}
      </>}
  </main>;
}

function Station({ orgId, program, reload }: { orgId: string; program: ProgramSummary; reload: () => void }) {
  const [camera, setCamera] = useState<CameraStatus>('off');
  const [result, setResult] = useState<{ run: InspectionRun; image: Blob } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [stale, setStale] = useState(false);
  const captureInProgress = useRef(false);
  const input = useRef<HTMLInputElement>(null);
  const imageUrl = useObjectUrl(result?.image ?? null);

  async function inspect(image: Blob) {
    if (captureInProgress.current || stale || !program.published_revision) return;
    captureInProgress.current = true;
    setBusy(true);
    setError('');
    setResult(null);
    try {
      const jpeg = await toJpeg(image);
      const run = await inspectBoard(orgId, program.id, jpeg, program.published_revision);
      setResult({ run, image: jpeg });
    } catch (cause) {
      setStale(cause instanceof ApiRequestError && ['live_changed', 'program_unpublished', 'program_not_found'].includes(cause.code));
      setError(errorText(cause, 'The inspection could not complete. Try another capture.'));
    } finally {
      captureInProgress.current = false;
      setBusy(false);
    }
  }

  const snapshot = result?.run.program_snapshot;
  const flaggedZones = result?.run.zone_results.filter(zone => zone.decision !== 'PASS') ?? [];

  return <>
    <div className="row operator-status">
      <span className="chip plain">Live revision {program.published_revision}</span>
      <span className={`chip operator-camera-status ${camera}`} role="status"><Icon name="camera" /> {CAMERA_LABEL[camera]}</span>
    </div>
    <div className="operator-layout">
      <section className="card operator-card" aria-label="Board capture">
        <CameraCapture busy={busy || stale} demo={false} onStatus={setCamera} onCapture={image => void inspect(image)} />
        <input type="file" accept="image/*" hidden ref={input} onChange={event => {
          const photo = event.target.files?.[0];
          event.target.value = '';
          if (photo) void inspect(photo);
        }} />
        <button type="button" className="btn ghost" disabled={busy || stale} onClick={() => input.current?.click()}>
          <Icon name="upload" /> Upload board photo
        </button>
      </section>
      <section className="card operator-card operator-verdict" aria-label="Inspection result" aria-live="polite">
        {error ? <ErrorBox message={error} onRetry={stale ? reload : undefined} />
          : busy ? <Loading label="Inspecting board…" />
          : result ? <>
            <div className="operator-decision"><DecisionBadge decision={result.run.decision} large /></div>
            <h2>{NEXT_ACTION[result.run.decision]}</h2>
            {flaggedZones.length > 0 && <ul className="operator-zones">
              {flaggedZones.map(zone => <li key={zone.zone_id}>{zone.name} <DecisionBadge decision={zone.decision} /></li>)}
            </ul>}
            {imageUrl && <BoardOverlay src={imageUrl} zones={snapshot?.zones.map(({ region, ...zone }) => ({ ...zone, ...region })) ?? []}
              labels={snapshot?.classes ?? []} confidence={result.run.confidence} results={result.run.zone_results} detections={result.run.detections} />}
            <a className="btn ghost" href={`/results/${result.run.id}`}><Icon name="eye" /> Open saved result</a>
          </> : <div className="empty">
            <span className="bubble"><Icon name="inspect" /></span>
            <h2>Ready to inspect</h2>
            <p className="muted">Capture a frame or upload a board photo.</p>
          </div>}
      </section>
    </div>
  </>;
}
