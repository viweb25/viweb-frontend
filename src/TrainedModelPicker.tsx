import { useEffect, useState } from 'react';

import { WorkspaceIcon } from './WorkspaceIcon';
import { makeJpeg } from './inspectionImage';
import type { Detection } from './services/api/inspection';
import {
  checkpointUrl, listCompletedJobs, previewTrainedModel, type TrainingJob,
} from './services/api/trainingDatasets';

export function TrainedModelPicker({ orgId, datasetId, revision, partName }: {
  orgId: string;
  datasetId: string;
  revision: number;
  partName: string;
}) {
  const [models, setModels] = useState<TrainingJob[] | null>(null);
  const [selected, setSelected] = useState('');
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    listCompletedJobs(orgId, datasetId, controller.signal).then(jobs => {
      if (controller.signal.aborted) return;
      setModels(jobs);
      setSelected(previous => jobs.some(job => job.id === previous) ? previous : jobs[0]?.id ?? '');
      setError('');
    }).catch(() => {
      if (!controller.signal.aborted) setError('Could not load trained models.');
    });
    return () => controller.abort();
  }, [orgId, datasetId, attempt]);

  if (error) return <div role="alert">
    <p>{error}</p>
    <button type="button" className="secondary" onClick={() => setAttempt(value => value + 1)}>Retry</button>
  </div>;
  if (!models) return <p role="status">Loading trained models…</p>;
  if (!models.length) return <>
    <h2>No finished models for this photo set</h2>
    <p>When training finishes, your model will appear here.</p>
    <a className="button secondary" href="#models">Go to training</a>
  </>;

  const selectedModel = models.find(model => model.id === selected);
  const part = selectedModel?.dataset_revision === revision ? partName : '';

  return <div className="training-footer">
    <h2 id="trained-models-heading">Choose a model to test</h2>
    <div className="model-options" role="group" aria-labelledby="trained-models-heading">
      {models.map((model, index) => (
        <button type="button" className="model-option" key={model.id}
          aria-pressed={selected === model.id} onClick={() => setSelected(model.id)}>
          <span className="action-icon"><WorkspaceIcon name="models" /></span>
          <span className="model-option-title">
            <strong>{index === 0 ? 'Latest model' : `Earlier model ${models.length - index}`}</strong>
            <small>{new Date(model.finished_at ?? model.created_at).toLocaleString()}</small>
          </span>
          {selected === model.id && <span className="model-option-check">
            <WorkspaceIcon name="check" /><span>Selected</span>
          </span>}
        </button>
      ))}
    </div>
    {selected && <>
      <ModelPreview key={selected} orgId={orgId} datasetId={datasetId} jobId={selected} partName={part} />
      <a className="button secondary" href={checkpointUrl(orgId, datasetId, selected)}>
        Download model
      </a>
    </>}
  </div>;
}

function ModelPreview({ orgId, datasetId, jobId, partName }: {
  orgId: string;
  datasetId: string;
  jobId: string;
  partName: string;
}) {
  const [photo, setPhoto] = useState<Blob | null>(null);
  const [url, setUrl] = useState('');
  const [confidence, setConfidence] = useState(50);
  const [detections, setDetections] = useState<Detection[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!photo) return;
    const preview = URL.createObjectURL(photo);
    setUrl(preview);
    return () => URL.revokeObjectURL(preview);
  }, [photo]);

  async function choosePhoto(file: File) {
    setPhoto(null);
    setUrl('');
    setDetections(null);
    setError('');
    setBusy(true);
    try {
      const bitmap = await createImageBitmap(file);
      try {
        setPhoto(await makeJpeg(bitmap, bitmap.width, bitmap.height));
      } finally {
        bitmap.close();
      }
    } catch {
      setError('Could not open the photo. Choose a JPEG or PNG.');
    } finally {
      setBusy(false);
    }
  }

  async function testPhoto() {
    if (!photo) return;
    setBusy(true);
    setDetections(null);
    setError('');
    try {
      setDetections(await previewTrainedModel(orgId, datasetId, jobId, photo, confidence / 100));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not test the model.');
    } finally {
      setBusy(false);
    }
  }

  const part = partName || 'the trained part';
  const decision = detections?.length ? 'PASS' : 'FAIL';

  return <>
    <p>Presence check. The photo passes when the model detects at least one instance of {part}.</p>
    <label className="demo-field">
      Test photo (JPEG or PNG)
      <input type="file" accept="image/jpeg,image/png" disabled={busy} onChange={event => {
        const file = event.target.files?.[0];
        if (file) void choosePhoto(file);
        event.target.value = '';
      }} />
    </label>
    {url && <div className="detection-preview trained-model-preview">
      <img src={url} alt="Test photo" />
      {detections?.map((box, index) => <div key={index} className="detection-box" style={{
        left: `${box.x1 * 100}%`, top: `${box.y1 * 100}%`,
        width: `${(box.x2 - box.x1) * 100}%`, height: `${(box.y2 - box.y1) * 100}%`,
      }}><span>#{index + 1} {box.label} {Math.round(box.confidence * 100)}%</span></div>)}
    </div>}
    <label className="demo-field">
      Minimum confidence ({confidence}%)
      <input type="range" min={1} max={100} value={confidence} disabled={busy}
        onChange={event => {
          setConfidence(Number(event.target.value));
          setDetections(null);
        }} />
    </label>
    <button type="button" disabled={busy || !photo} onClick={() => void testPhoto()}>
      {busy ? 'Working…' : 'Run test'}
    </button>
    {detections && <section className="check-result" aria-label="Test result">
      <div role="status">
        <span className={`badge ${decision.toLowerCase()}`}>{decision}</span>
        <p>{detections.length
          ? `Detected ${detections.length} ${detections.length === 1 ? 'object' : 'objects'} at ${confidence}% minimum confidence.`
          : `No detection of ${part} at ${confidence}% minimum confidence.`}</p>
      </div>
      {detections.length > 0 && <>
        <h3>All detections</h3>
        <ol className="trained-model-detections">
          {detections.map((box, index) => <li key={index}>
            {box.label} · {Math.round(box.confidence * 100)}% confidence
          </li>)}
        </ol>
      </>}
    </section>}
    {error && <p role="alert"><span className="badge hold">HOLD</span> {error}</p>}
  </>;
}
