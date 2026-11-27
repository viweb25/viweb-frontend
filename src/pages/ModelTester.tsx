import { useEffect, useRef, useState } from 'react';

import { analyzeImage } from '../services/api/inspection';
import { makeJpeg } from '../inspectionImage';
import { previewTrainedModel, type ModelCheck, type TrainingJob } from '../services/api/trainingDatasets';
import { Icon } from '../ui/Icon';
import { ErrorBox, QUALITY, colorFor, errorText, kindVerdict, percent, qualityBand, timeAgo, useObjectUrl } from '../ui/common';

export function versionName(model: TrainingJob, models: TrainingJob[]) {
  return model.version_name || `Version ${models.length - models.indexOf(model)}`;
}

export function VersionList({ models, selected, onSelect }: {
  models: TrainingJob[];
  selected: string;
  onSelect: (id: string) => void;
}) {
  return <div className="versions" role="group" aria-label="Model versions">
    {models.map((model, index) => {
      const score = model.evaluation?.['metrics/mAP50-95(B)'];
      return <button key={model.id} type="button" className="version" aria-pressed={selected === model.id} onClick={() => onSelect(model.id)}>
        <span className="avatar soft">{models.length - index}</span>
        <span style={{ minWidth: 0 }}>
          <strong style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {versionName(model, models)}{index === 0 && <span className="chip" style={{ marginLeft: '.4rem' }}>Latest</span>}
          </strong>
          <small>Trained {timeAgo(model.finished_at ?? model.created_at)}</small>
        </span>
        <span className="score" title="Test score">{score === undefined ? '' : QUALITY[qualityBand(score)]}</span>
      </button>;
    })}
  </div>;
}

type Source = 'upload' | 'camera';

export function ModelTester({ orgId, datasetId, model, labels, kindOf }: {
  orgId: string;
  datasetId: string;
  model: TrainingJob;
  labels: string[];
  kindOf?: (label: string) => 'good' | 'defect' | 'object';
}) {
  return <ImageTester labels={labels} kindOf={kindOf} views={model.reference_views}
    check={(image, confidence, reference, compare) =>
      previewTrainedModel(orgId, datasetId, model.id, image, confidence, reference, compare)} />;
}

export function DemoTester() {
  return <ImageTester demo labels={[]} check={async (image, confidence) => {
    const result = await analyzeImage(image, confidence, false);
    const error = result.error ?? result.detection_error;
    if (error) throw new Error(error);
    return { decision: null, detections: result.detections, expected: {}, found: result.counts };
  }} />;
}

function ImageTester({ labels, kindOf, views = [], check, demo = false }: {
  labels: string[];
  kindOf?: (label: string) => 'good' | 'defect' | 'object';
  views?: TrainingJob['reference_views'];
  check: (image: Blob, confidence: number, reference: string, compare: boolean) => Promise<ModelCheck>;
  demo?: boolean;
}) {
  const passFail = !!kindOf && labels.some(label => kindOf(label) !== 'object');
  const [source, setSource] = useState<Source>('upload');
  const [photo, setPhoto] = useState<Blob | null>(null);
  const url = useObjectUrl(photo);
  const [confidence, setConfidence] = useState(50);
  const [compare, setCompare] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [reference, setReference] = useState(views.length === 1 ? views[0].id : '');
  const [rawResult, setResult] = useState<ModelCheck | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const input = useRef<HTMLInputElement>(null);
  const needsReference = compare && views.length > 1 && !reference;

  async function choose(file?: Blob) {
    if (busy) return;
    setBusy(true);
    setResult(null);
    setError('');
    try {
      if (!file) {
        const response = await fetch(`${import.meta.env.BASE_URL}person-demo.jpg`);
        if (!response.ok) throw new Error('Could not load the sample photo.');
        file = await response.blob();
      }
      const bitmap = await createImageBitmap(file);
      let jpeg: Blob;
      try {
        jpeg = await makeJpeg(bitmap, bitmap.width, bitmap.height);
      } finally {
        bitmap.close();
      }
      setPhoto(jpeg);
      if (!needsReference) await checkPhoto(jpeg);
    } catch (cause) {
      setError(cause instanceof DOMException ? 'Could not open this image. Try a JPEG or PNG.' : errorText(cause, 'Could not open this image.'));
    } finally {
      setBusy(false);
    }
  }

  async function checkPhoto(image: Blob) {
    try {
      setResult(await check(image, confidence / 100, reference, compare));
    } catch (cause) {
      setResult(null);
      setError(errorText(cause, 'The model could not check this photo.'));
    }
  }

  async function run() {
    if (!photo || needsReference || busy) return;
    setBusy(true);
    setError('');
    try {
      await checkPhoto(photo);
    } finally {
      setBusy(false);
    }
  }

  const result = demo && !showAll && rawResult ? {
    ...rawResult,
    detections: rawResult.detections.filter(box => box.label === 'person'),
    found: { person: rawResult.found.person ?? 0 },
  } : rawResult;
  const colorLabels = demo ? Object.keys(rawResult?.found ?? {}).sort() : labels;

  const allLabels = result ? [...new Set([...Object.keys(result.expected), ...Object.keys(result.found)])] : [];
  const total = result ? Object.values(result.found).reduce((sum, count) => sum + count, 0) : 0;
  const verdict = result ? result.decision ?? (passFail && kindOf ? kindVerdict(result.found, kindOf) : null) : null;
  const defectsFound = result && kindOf ? Object.keys(result.found).filter(label => kindOf(label) === 'defect' && result.found[label] > 0) : [];

  return <div className="stack" style={{ gap: '1.25rem' }}>
    <div className="row">
      <div className="seg" role="group" aria-label="Photo source">
        <button type="button" aria-pressed={source === 'upload'} onClick={() => setSource('upload')}><Icon name="upload" /> Upload</button>
        <button type="button" aria-pressed={source === 'camera'} onClick={() => setSource('camera')}><Icon name="camera" /> Camera</button>
      </div>
      {demo ? <div className="seg" role="group" aria-label="What to find">
        <button type="button" aria-pressed={!showAll} onClick={() => setShowAll(false)}>People</button>
        <button type="button" aria-pressed={showAll} onClick={() => setShowAll(true)}>All objects</button>
      </div> : <div className="seg" role="group" aria-label="Check type">
        <button type="button" aria-pressed={!compare} onClick={() => { setCompare(false); setResult(null); }}>{passFail ? 'Good or defect' : 'Find and count'}</button>
        <button type="button" aria-pressed={compare} disabled={!views.length} onClick={() => { setCompare(true); setResult(null); }}
          title={views.length ? undefined : 'Needs a training photo with boxes'}>Compare to a good photo</button>
      </div>}
    </div>

    {compare && <div className="notice"><Icon name="info" />
      <div className="spacer">A photo passes when it has exactly the same objects as a good training photo.
        {views.length > 1 && <label className="field" style={{ marginTop: '.6rem' }}>Which view are you checking?
          <select value={reference} onChange={event => { setReference(event.target.value); setResult(null); }}>
            <option value="">Choose a good example</option>
            {views.map(view => <option key={view.id} value={view.id}>
              {view.name} · {Object.entries(view.counts).map(([label, count]) => `${count} ${label}`).join(', ')}
            </option>)}
          </select>
        </label>}
      </div>
    </div>}

    <div className="test-layout image-test-layout">
      <div className="stack" style={{ gap: '.75rem' }}>
        {source === 'camera'
          ? <CameraCapture busy={busy} onCapture={blob => void choose(blob)} demo={demo} />
          : <div className="stage" onDragOver={event => event.preventDefault()}
            onDrop={event => {
              event.preventDefault();
              const file = event.dataTransfer.files[0];
              if (file) void choose(file);
            }}>
            {url ? <div className="shot">
              <img src={url} alt="Photo being checked" />
              {result?.detections.map((box, index) => <div key={index} className="dbox" style={{
                left: `${box.x1 * 100}%`, top: `${box.y1 * 100}%`, width: `${(box.x2 - box.x1) * 100}%`, height: `${(box.y2 - box.y1) * 100}%`,
                borderColor: colorFor(colorLabels, box.label),
              }}><span style={{ background: colorFor(colorLabels, box.label) }}>{box.label} {Math.round(box.confidence * 100)}%</span></div>)}
            </div> : <div className="stage-empty">
              <Icon name="image" />
              <strong>Drop a photo here</strong>
              <span className="small">{demo ? 'Use the sample or upload your own photo.' : 'Use a photo the model has not seen before.'}</span>
              <button type="button" className="btn" onClick={() => input.current?.click()}><Icon name="upload" /> Choose photo</button>
            </div>}
            {busy && <div className="loading" style={{ position: 'absolute', inset: 0, background: 'rgb(17 17 17 / 45%)', color: '#fff' }}>
              <span className="spinner" />Checking…</div>}
          </div>}
        {source === 'camera' && url && <div className="stage"><div className="shot">
          <img src={url} alt="Captured frame" />
          {result?.detections.map((box, index) => <div key={index} className="dbox" style={{
            left: `${box.x1 * 100}%`, top: `${box.y1 * 100}%`, width: `${(box.x2 - box.x1) * 100}%`, height: `${(box.y2 - box.y1) * 100}%`,
            borderColor: colorFor(colorLabels, box.label),
          }}><span style={{ background: colorFor(colorLabels, box.label) }}>{box.label} {Math.round(box.confidence * 100)}%</span></div>)}
        </div></div>}
        <input ref={input} type="file" accept="image/*" hidden onChange={event => {
          const file = event.target.files?.[0];
          if (file) void choose(file);
          event.target.value = '';
        }} />
        {source === 'upload' && (url || demo) && <div className="row">
          {url && <button type="button" className="btn ghost" disabled={busy} onClick={() => input.current?.click()}><Icon name="upload" /> Try another photo</button>}
          {demo && <button type="button" className="btn ghost" disabled={busy} onClick={() => void choose()}><Icon name="image" /> Try sample photo</button>}
        </div>}
      </div>

      <aside className="stack" style={{ gap: '1rem' }}>
        <section className="card side-card">
          <label className="field">Confidence threshold · {confidence}%
            <input type="range" min={5} max={95} step={5} value={confidence} onChange={event => setConfidence(Number(event.target.value))}
              onPointerUp={() => void run()} onKeyUp={() => void run()} />
            <small>Lower finds more objects but may add mistakes.</small>
          </label>
          {photo && <button type="button" className="btn ghost" disabled={busy || needsReference} onClick={() => void run()}>Check again</button>}
        </section>

        {error && <ErrorBox message={error} />}
        {needsReference && photo && <div className="notice"><Icon name="info" />Choose which good example to compare against.</div>}

        {result && <section className="card result" aria-live="polite">
          {verdict ? <span className={`verdict ${verdict.toLowerCase()}`}>
            <Icon name={verdict === 'PASS' ? 'check' : 'alert'} /> {verdict}
          </span> : <h3>{demo && !showAll ? (total ? `Found ${total} ${total === 1 ? 'person' : 'people'}` : 'No people found') : total ? `Found ${total} ${total === 1 ? 'object' : 'objects'}` : 'Nothing found'}</h3>}
          {verdict === 'FAIL' && <p className="small">{result.decision
            ? 'The objects in this photo do not match the good example.'
            : <>Defect found: <b>{defectsFound.map(label => `${result.found[label]} × ${label}`).join(', ')}</b>.</>}</p>}
          {verdict === 'PASS' && !result.decision && <p className="small">Only good items found. No defects.</p>}
          {passFail && !verdict && !compare && <p className="small">The model did not find anything it knows in this photo.</p>}
          {allLabels.length > 0 ? <ul className="counts">
            {allLabels.map(label => {
              const found = result.found[label] ?? 0;
              const expected = result.expected[label];
              const miss = result.decision !== null && found !== (expected ?? 0);
              return <li key={label} className={miss ? 'miss' : ''}>
                <span className="swatch" style={{ background: colorFor(colorLabels, label) }} />
                <span>{label}</span>
                <span>{found}{result.decision !== null && <span className="muted"> / {expected ?? 0}</span>}</span>
              </li>;
            })}
          </ul> : <p className="small muted">Try lowering the confidence threshold, or check that the photo looks like your training photos.</p>}
        </section>}
      </aside>
    </div>
  </div>;
}

export type CameraStatus = 'off' | 'starting' | 'ready' | 'error';

export function CameraCapture({ busy, onCapture, demo, onStatus }: {
  busy: boolean; onCapture: (image: Blob) => void; demo: boolean;
  onStatus?: (status: CameraStatus) => void;
}) {
  const video = useRef<HTMLVideoElement>(null);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [deviceId, setDeviceId] = useState('');
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [error, setError] = useState('');
  const [starting, setStarting] = useState(false);
  const cameraRequest = useRef(0);
  const activeStream = useRef<MediaStream | null>(null);

  useEffect(() => () => {
    cameraRequest.current += 1;
    activeStream.current?.getTracks().forEach(track => track.stop());
  }, []);

  function stop() {
    cameraRequest.current += 1;
    activeStream.current?.getTracks().forEach(track => track.stop());
    activeStream.current = null;
    setStream(null);
    setStarting(false);
    onStatus?.('off');
  }

  async function start(id = deviceId) {
    setError('');
    stop();
    const request = cameraRequest.current;
    if (!navigator.mediaDevices?.getUserMedia) {
      setError('This browser cannot open cameras here. Use HTTPS or localhost.');
      onStatus?.('error');
      return;
    }
    setStarting(true);
    onStatus?.('starting');
    try {
      const next = await navigator.mediaDevices.getUserMedia({
        video: id ? { deviceId: { exact: id }, width: { ideal: 1920 } } : { width: { ideal: 1920 } }, audio: false,
      });
      if (request !== cameraRequest.current) {
        next.getTracks().forEach(track => track.stop());
        return;
      }
      activeStream.current = next;
      setStream(next);
      next.getVideoTracks().forEach(track => track.addEventListener('ended', () => {
        if (request !== cameraRequest.current) return;
        stop();
        onStatus?.('error');
        setError('The camera disconnected. Reconnect it and try again.');
      }));
      if (video.current) {
        video.current.srcObject = next;
        await video.current.play().catch(() => undefined);
      }
      if (request !== cameraRequest.current) return;
      onStatus?.('ready');
      const all = await navigator.mediaDevices.enumerateDevices().catch(() => []);
      if (request === cameraRequest.current) setDevices(all.filter(device => device.kind === 'videoinput'));
    } catch {
      if (request === cameraRequest.current) {
        setError('Could not open the camera. Allow camera access in your browser and try again.');
        onStatus?.('error');
      }
    } finally {
      if (request === cameraRequest.current) setStarting(false);
    }
  }

  async function capture() {
    const element = video.current;
    if (!element || !element.videoWidth) return;
    const request = cameraRequest.current;
    try {
      const image = await makeJpeg(element, element.videoWidth, element.videoHeight);
      if (request === cameraRequest.current) onCapture(image);
    } catch {
      if (request === cameraRequest.current) setError('Could not capture a camera frame. Try again.');
    }
  }

  return <div className="stack" style={{ gap: '.75rem' }}>
    <div className="stage">
      <video ref={video} playsInline muted hidden={!stream} aria-label="Live camera" />
      {!stream && <div className="stage-empty">
        <Icon name="camera" />
        <strong>Live camera</strong>
        <span className="small">{demo ? 'Capture a frame with people or objects in view.' : 'Point the camera at a part, then capture a frame to check it.'}</span>
        <button type="button" className="btn" disabled={starting || busy} onClick={() => void start()}><Icon name="play" /> {starting ? 'Starting…' : 'Start camera'}</button>
      </div>}
    </div>
    {error && <ErrorBox message={error} />}
    {stream && <div className="row">
      <button type="button" className="btn" disabled={busy} onClick={() => void capture()}><Icon name="camera" /> {busy ? 'Checking…' : 'Capture and check'}</button>
      {devices.length > 1 && <select className="input" style={{ width: 'auto' }} aria-label="Camera" disabled={busy} value={deviceId}
        onChange={event => { setDeviceId(event.target.value); void start(event.target.value); }}>
        <option value="">Default camera</option>
        {devices.map((device, index) => <option key={device.deviceId} value={device.deviceId}>{device.label || `Camera ${index + 1}`}</option>)}
      </select>}
      <button type="button" className="btn ghost" onClick={stop}>
        <Icon name="stop" /> Stop camera</button>
    </div>}
  </div>;
}

export function ScoreTable({ models }: { models: TrainingJob[] }) {
  if (!models.some(model => model.evaluation)) return null;
  return <div className="table-wrap"><table className="data">
    <thead><tr><th>Version</th><th>Quality</th><th>Right when it finds</th><th>Finds what is there</th><th>Easy score</th><th>Overall score</th></tr></thead>
    <tbody>{models.map(model => {
      const value = (key: string) => model.evaluation?.[`metrics/${key}(B)`];
      const score = value('mAP50-95');
      return <tr key={model.id}>
        <td><strong>{versionName(model, models)}</strong></td>
        <td>{score === undefined ? '—' : QUALITY[qualityBand(score)]}</td>
        <td>{percent(value('precision'), 1)}</td><td>{percent(value('recall'), 1)}</td>
        <td>{percent(value('mAP50'), 1)}</td><td>{percent(score, 1)}</td>
      </tr>;
    })}</tbody>
  </table></div>;
}
