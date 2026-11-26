/* Shared pieces for inspection programs and results. */
import { makeJpeg } from '../../inspectionImage';
import type { Detection } from '../../services/api/inspection';
import type { Decision, ReviewStatus, Zone, ZoneResult } from '../../services/api/inspectionPrograms';
import { Icon, type IconName } from '../../ui/Icon';
import { colorFor } from '../../ui/common';

export const DECISION_INFO: Record<Decision, { label: string; icon: IconName; text: string }> = {
  PASS: { label: 'Pass', icon: 'check', text: 'Every zone matches the golden layout.' },
  FAIL: { label: 'Fail', icon: 'close', text: 'A critical zone has a missing, extra or defective item.' },
  REVIEW: { label: 'Review', icon: 'eye', text: 'The model is unsure, or a non-critical zone differs. A person should check.' },
};

export const REVIEW_LABEL: Record<ReviewStatus, string> = {
  none: 'Not reviewed',
  pending: 'Waiting for review',
  confirmed: 'Model was right',
  corrected: 'Model was wrong',
};

export function DecisionBadge({ decision, large = false }: { decision: Decision; large?: boolean }) {
  const info = DECISION_INFO[decision];
  return <span className={`decision ${decision.toLowerCase()}${large ? ' large' : ''}`} title={info.text}>
    <Icon name={info.icon} />{info.label}
  </span>;
}

/** Turn any image (file, blob or URL) into a JPEG blob for the API. */
export async function toJpeg(source: Blob | string): Promise<Blob> {
  let blob: Blob;
  if (typeof source === 'string') {
    const response = await fetch(source);
    if (!response.ok) throw new Error('Could not open the photo.');
    blob = await response.blob();
  } else blob = source;
  if (blob.type === 'image/jpeg') return blob;
  const bitmap = await createImageBitmap(blob);
  try { return await makeJpeg(bitmap, bitmap.width, bitmap.height); } finally { bitmap.close(); }
}

function rect(box: { x1: number; y1: number; x2: number; y2: number }) {
  return { left: `${box.x1 * 100}%`, top: `${box.y1 * 100}%`, width: `${(box.x2 - box.x1) * 100}%`, height: `${(box.y2 - box.y1) * 100}%` };
}

/** A photo with zone outlines (colored by result) and detection boxes on top. */
export function BoardOverlay({ src, zones, results, detections = [], labels, confidence = 0, onZoneClick, selectedZone }: {
  src: string;
  zones: Zone[];
  results?: ZoneResult[];
  detections?: Detection[];
  labels: string[];
  confidence?: number;
  onZoneClick?: (id: string) => void;
  selectedZone?: string | null;
}) {
  const byZone = new Map(results?.map(result => [result.zone_id, result]));
  return <div className="board">
    <img src={src} alt="Board" draggable={false} />
    {zones.map((zone, index) => {
      const result = byZone.get(zone.id);
      const state = result ? result.decision.toLowerCase() : 'plain';
      return <div key={zone.id} className={`zone ${state}${selectedZone === zone.id ? ' selected' : ''}`} style={rect(zone)}
        onClick={onZoneClick ? () => onZoneClick(zone.id) : undefined}>
        <span className="zone-tag">{index + 1}. {zone.name}{result && <> · {DECISION_INFO[result.decision].label}</>}</span>
      </div>;
    })}
    {detections.map((detection, index) => {
      const unsure = detection.confidence < confidence;
      return <div key={index} className={`det${unsure ? ' unsure' : ''}`} style={{ ...rect(detection), borderColor: colorFor(labels, detection.label) }}
        title={`${detection.label} ${(detection.confidence * 100).toFixed(0)}%${unsure ? ' (unsure)' : ''}`} />;
    })}
  </div>;
}

function counts(values: Record<string, number>) {
  const entries = Object.entries(values);
  return entries.length ? entries.map(([label, count]) => `${count} × ${label}`).join(', ') : '—';
}

/** Per-zone table: expected vs found, and why the zone failed. */
export function ZoneResultTable({ results }: { results: ZoneResult[] }) {
  return <div className="table-wrap"><table className="data zone-table">
    <thead><tr><th>Zone</th><th>Result</th><th>Expected</th><th>Found</th><th>Problem</th></tr></thead>
    <tbody>{results.map(result => {
      const problems = [
        Object.keys(result.missing).length ? `Missing ${counts(result.missing)}` : '',
        Object.keys(result.extra).length ? `Extra ${counts(result.extra)}` : '',
        result.defects.length ? `Defect: ${result.defects.join(', ')}` : '',
        result.uncertain ? `${result.uncertain} unsure` : '',
      ].filter(Boolean);
      return <tr key={result.zone_id}>
        <td><b>{result.name}</b>{!result.critical && <small className="muted"> · not critical</small>}</td>
        <td><DecisionBadge decision={result.decision} /></td>
        <td>{counts(result.expected)}</td>
        <td>{counts(result.found)}</td>
        <td>{problems.length ? problems.join(' · ') : <span className="muted">None</span>}</td>
      </tr>;
    })}</tbody>
  </table></div>;
}
