import { useCallback, useEffect, useRef, useState, type ChangeEvent } from 'react';

import { useWorkspacePreferences } from './context/WorkspacePreferences';
import {
  analyzeImage, detectObjects, inspectImage, loadDetectionModel,
  type DetectionModel, type ImageAnalysis, type InspectionResult,
} from './services/api/inspection';
import { exampleImage, loadExamples, saveExample, type Example, type Label } from './services/api/trainingExamples';

async function makeJpeg(source: CanvasImageSource, width: number, height: number) {
  const scale = Math.min(1, 1920 / Math.max(width, height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Image capture is unavailable.');
  context.drawImage(source, 0, 0, canvas.width, canvas.height);
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(image => image ? resolve(image) : reject(new Error('Could not encode image.')), 'image/jpeg', 0.9);
  });
}

export function InspectionDemo({ mode, onResult }: {
  mode: 'inspect' | 'training' | null;
  onResult: (result: InspectionResult) => void;
}) {
  const { preferences, update } = useWorkspacePreferences();
  const rule = preferences.acceptanceRule;
  const training = mode === 'training';
  const [engine, setEngine] = useState<'analyze' | 'qwen' | 'yolo'>('yolo');
  const [target, setTarget] = useState('');
  const [model, setModel] = useState<DetectionModel | null>(null);
  const [modelError, setModelError] = useState(false);
  const [modelRefresh, setModelRefresh] = useState(0);
  const [confidence, setConfidence] = useState('50');
  const [expectedCount, setExpectedCount] = useState('1');
  const count = Number(expectedCount);
  const validConfidence = Number(confidence) >= 1 && Number(confidence) <= 100;
  const canInspect = engine === 'analyze' ? validConfidence : engine === 'qwen' ? !!rule.trim()
    : model?.status === 'ready' && model.classes.includes(target) &&
      Number.isInteger(count) && count >= 1 && count <= 999 &&
      validConfidence;
  const monitor = useRef<HTMLDivElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const photoInput = useRef<HTMLInputElement>(null);
  const uploadInput = useRef<HTMLInputElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const mounted = useRef(false);
  const [cameras, setCameras] = useState<MediaDeviceInfo[]>([]);
  const [cameraChoice, setCameraChoice] = useState('default');
  const [activeSource, setActiveSource] = useState<'camera' | 'viewer' | null>(null);
  const [cameraReady, setCameraReady] = useState(false);
  const [image, setImage] = useState<Blob | null>(null);
  const [preview, setPreview] = useState('');
  const [frameRatio, setFrameRatio] = useState(1);
  const [completed, setCompleted] = useState<
    { rule: string; result: InspectionResult } | { analysis: ImageAnalysis } | null
  >(null);
  const result = completed && 'result' in completed && completed.rule === rule.trim()
    ? completed.result : null;
  const analysis = completed && 'analysis' in completed ? completed.analysis : null;
  const detections = analysis?.detections ?? result?.detections;
  const [inspecting, setInspecting] = useState(false);
  const [partId, setPartId] = useState('');
  const [examples, setExamples] = useState<Example[]>([]);
  const [availability, setAvailability] = useState('');
  const [ready, setReady] = useState(false);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      stream.current?.getTracks().forEach(track => track.stop());
      stream.current = null;
    };
  }, []);

  const stopVideo = useCallback(() => {
    stream.current?.getTracks().forEach(track => track.stop());
    stream.current = null;
    if (video.current) video.current.srcObject = null;
    setActiveSource(null);
    setCameraReady(false);
  }, []);

  const refreshCameras = useCallback(async () => {
    const devices = await navigator.mediaDevices?.enumerateDevices().catch(() => []);
    if (!mounted.current || !devices) return;
    const inputs = devices.filter(device => device.kind === 'videoinput' && device.deviceId);
    setCameras(inputs);
    setCameraChoice(previous => previous.startsWith('device:') &&
      !inputs.some(input => `device:${input.deviceId}` === previous) ? 'default' : previous);
  }, []);

  useEffect(() => {
    if (!mode) {
      stopVideo();
      return;
    }
    const devices = navigator.mediaDevices;
    devices?.addEventListener('devicechange', refreshCameras);
    void refreshCameras();
    return () => devices?.removeEventListener('devicechange', refreshCameras);
  }, [mode, refreshCameras, stopVideo]);

  useEffect(() => {
    if (mode !== 'inspect' || engine !== 'yolo') return;
    const controller = new AbortController();
    setModel(null);
    setModelError(false);
    loadDetectionModel(controller.signal).then(info => {
      if (controller.signal.aborted) return;
      setModel(info);
      setTarget(previous => info.classes.includes(previous) ? previous
        : info.classes.length === 1 ? info.classes[0] : '');
    }).catch(() => {
      if (!controller.signal.aborted) setModelError(true);
    });
    return () => controller.abort();
  }, [mode, engine, modelRefresh]);

  useEffect(() => {
    if (!training) return;
    const controller = new AbortController();
    setReady(false);
    setAvailability('');
    loadExamples(controller.signal).then(items => {
      if (controller.signal.aborted) return;
      setExamples(items);
      setReady(true);
    }).catch(error => {
      if (!controller.signal.aborted) setAvailability(error.message);
    });
    return () => controller.abort();
  }, [training]);

  useEffect(() => {
    if (!image) {
      setPreview('');
      return;
    }
    const url = URL.createObjectURL(image);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [image]);

  async function startVideo(source: 'camera' | 'viewer') {
    setBusy(true);
    setMessage('');
    const previewElement = video.current;
    try {
      const constraints = cameraChoice.startsWith('device:')
        ? { deviceId: { exact: cameraChoice.slice('device:'.length) } }
        : cameraChoice === 'rear' ? { facingMode: { ideal: 'environment' } } : true;
      const media = navigator.mediaDevices;
      const selected = source === 'camera'
        ? await media.getUserMedia({ video: constraints, audio: false })
        : await media.getDisplayMedia({ video: true, audio: false });
      if (!mounted.current || !previewElement || video.current !== previewElement) {
        selected.getTracks().forEach(track => track.stop());
        return;
      }
      const track = selected.getVideoTracks()[0];
      if (!track || track.readyState !== 'live') {
        selected.getTracks().forEach(item => item.stop());
        throw new Error('Video input ended');
      }
      stream.current = selected;
      track.addEventListener('ended', () => {
        if (stream.current !== selected) return;
        stopVideo();
        setMessage(source === 'camera' ? 'Camera disconnected.' : 'Viewer sharing stopped.');
      }, { once: true });
      previewElement.srcObject = selected;
      setActiveSource(source);
      await previewElement.play();
      if (source === 'camera') void refreshCameras();
    } catch (error) {
      stopVideo();
      if (source === 'viewer') {
        setMessage('Could not share the viewer. Open the camera viewer and select its window or tab.');
      } else if (error instanceof DOMException && error.name === 'NotAllowedError') {
        setMessage('Camera access was declined. Allow camera access in the browser and try again.');
      } else {
        setMessage('Could not open the selected camera. Reconnect it or try another camera.');
      }
    } finally {
      setBusy(false);
    }
  }

  async function capture(runInspection = false) {
    const frame = video.current;
    if (!frame?.videoWidth || stream.current?.getVideoTracks()[0]?.readyState !== 'live') {
      setMessage('Start a video source before capturing a frame.');
      return;
    }
    setBusy(true);
    setCompleted(null);
    setImage(null);
    try {
      const jpeg = await makeJpeg(frame, frame.videoWidth, frame.videoHeight);
      setImage(jpeg);
      setMessage('');
      if (runInspection) await inspect(jpeg);
    } catch {
      setMessage('Could not capture a frame.');
    } finally {
      setBusy(false);
    }
  }

  async function choosePhoto(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setBusy(true);
    setCompleted(null);
    setImage(null);
    try {
      const bitmap = await createImageBitmap(file);
      let jpeg: Blob;
      try {
        jpeg = await makeJpeg(bitmap, bitmap.width, bitmap.height);
      } finally {
        bitmap.close();
      }
      setImage(jpeg);
      setMessage('');
      if (!training && engine === 'analyze') await inspect(jpeg);
    } catch {
      setMessage('Could not open that photo. Try a JPEG or PNG.');
    } finally {
      setBusy(false);
    }
  }

  async function inspect(jpeg: Blob | null) {
    if (!jpeg || !canInspect) return;
    setBusy(true);
    setInspecting(true);
    setMessage('');
    setCompleted(null);
    try {
      if (engine === 'analyze') {
        const analysis = await analyzeImage(jpeg, Number(confidence) / 100);
        setCompleted({ analysis });
        return;
      }
      const response = engine === 'yolo'
        ? await detectObjects(target, count, Number(confidence) / 100, jpeg)
        : await inspectImage(rule.trim(), jpeg);
      setCompleted({ rule: rule.trim(), result: response });
      onResult(response);
    } catch {
      if (engine === 'analyze') {
        setMessage('Image analysis is unavailable.');
        return;
      }
      const response = { decision: 'HOLD', reason: 'Inspection service unavailable.', model: null } as const;
      setCompleted({ rule: rule.trim(), result: response });
      onResult(response);
    } finally {
      setInspecting(false);
      setBusy(false);
    }
  }

  async function labelPhoto(label: Label) {
    if (!image) return;
    setBusy(true);
    try {
      const saved = await saveExample(partId.trim(), label, image);
      setExamples(previous => [saved, ...previous]);
      setImage(null);
      setCompleted(null);
      setMessage(`Saved operator label ${label} for ${saved.part_id}.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not save the example.');
    } finally {
      setBusy(false);
    }
  }

  const cameraSupported = typeof navigator.mediaDevices?.getUserMedia === 'function';
  const sharingSupported = typeof navigator.mediaDevices?.getDisplayMedia === 'function';
  const canLabel = !!image && /^[A-Za-z0-9_-]{1,80}$/.test(partId.trim()) && !busy && ready;

  const modelReady = model?.status === 'ready';
  const personDemoAvailable = engine === 'yolo' && modelReady && model.classes.includes('person');
  function selectEngine(value: typeof engine) {
    setEngine(value);
    setCompleted(null);
  }

  function usePersonDemo() {
    setTarget('person');
    setExpectedCount('1');
    setConfidence('50');
    setCompleted(null);
  }

  if (!mode) return null;

  return <>
    <div className="workbench camera-workbench">
      <article className="panel camera-card">
        <div className="camera-heading">
          <h2>Image</h2>
          <span className={cameraReady ? 'camera-state live' : 'camera-state'}>
            {cameraReady ? 'Live camera' : activeSource ? 'Connecting…' : 'Camera off'}
          </span>
        </div>
        <div className="demo-actions">
          <button className="secondary" disabled={busy} onClick={() => uploadInput.current?.click()}>
            Upload photo
          </button>
          {cameraSupported && <button className="secondary" disabled={busy || !!activeSource}
            onClick={() => void startVideo('camera')}>Start camera</button>}
          {activeSource && <button className="secondary" disabled={busy} onClick={stopVideo}>
            {activeSource === 'camera' ? 'Stop camera' : 'Stop sharing'}
          </button>}
          <input ref={photoInput} type="file" accept="image/*" capture="environment" hidden
            onChange={choosePhoto} />
          <input ref={uploadInput} type="file" accept="image/*" hidden onChange={choosePhoto} />
        </div>
        <details className="camera-help">
          <summary>More camera options</summary>
          {cameraSupported && <label className="demo-field">Camera
            <select value={cameraChoice} disabled={busy || !!activeSource}
              onChange={event => setCameraChoice(event.target.value)}>
              <option value="default">Default camera</option>
              {navigator.mediaDevices.getSupportedConstraints().facingMode &&
                <option value="rear">Rear camera (if available)</option>}
              {cameras.map((camera, index) => <option key={camera.deviceId} value={`device:${camera.deviceId}`}>
                {camera.label || `Camera ${index + 1}`}
              </option>)}
            </select>
          </label>}
          <div className="demo-actions">
            <button className="secondary" disabled={busy} onClick={() => photoInput.current?.click()}>
              Take a photo
            </button>
            {sharingSupported && <button className="secondary" disabled={busy || !!activeSource}
              onClick={() => void startVideo('viewer')}>Share camera window</button>}
          </div>
          {sharingSupported && <p className="muted">Open the industrial camera’s live viewer before sharing it.</p>}
        </details>
        <div className="camera-monitor" ref={monitor}>
          {activeSource && <div className="camera-heading">
            <h3>Live feed</h3>
            {document.fullscreenEnabled && <button className="secondary" type="button" onClick={() => {
              const fullscreen = document.fullscreenElement ? document.exitFullscreen()
                : monitor.current?.requestFullscreen();
              void fullscreen?.catch(() => setMessage('Full screen is unavailable in this browser.'));
            }}>Full screen</button>}
          </div>}
          <video className="demo-image" ref={video} hidden={!cameraReady} muted playsInline
            onPlaying={() => { if (stream.current) setCameraReady(true); }} />
          {activeSource && !cameraReady && <div className="image-placeholder">Waiting for the live feed…</div>}
          {activeSource && <div className="demo-actions">
            {!training && <button disabled={!cameraReady || !canInspect || busy}
              onClick={() => void capture(true)}>{engine === 'analyze' ? 'Capture & analyze' : 'Capture & check'}</button>}
            <button className="secondary" disabled={!cameraReady || busy}
              onClick={() => void capture()}>Take a snapshot</button>
          </div>}
          {!training && cameraReady && !canInspect && (engine === 'qwen' || model?.status === 'ready') &&
            <p className="muted">Finish setting up your check, then capture a photo.</p>}
          {preview && <h3>Selected photo</h3>}
          {preview
          ? <div className={`detection-preview ${!training && result ? `frame-${result.decision.toLowerCase()}` : ''}`}>
            <img src={preview} alt="Selected image" onLoad={event => {
              const { naturalWidth, naturalHeight } = event.currentTarget;
              setFrameRatio(naturalWidth / naturalHeight);
            }} />
            {!training && detections?.map((box, index) => (
              <div className="detection-box" key={index} style={{
                left: `${box.x1 * 100}%`, top: `${box.y1 * 100}%`,
                width: `${(box.x2 - box.x1) * 100}%`, height: `${(box.y2 - box.y1) * 100}%`,
              }}>
                <span>{box.label} {Math.round(box.confidence * 100)}%</span>
              </div>
            ))}
          </div>
          : !activeSource && <div className="image-placeholder">Upload a photo or start a camera.</div>}
        </div>
        {message && <p className="muted" role="status">{message}</p>}
      </article>
      <article className="panel check-card">
        <h2>{training ? 'Save an example' : 'Inspection'}</h2>
        {training ? <>
          <label className="demo-field">Part reference
            <input value={partId} onChange={event => setPartId(event.target.value)}
              maxLength={80} placeholder="Enter the part ID" disabled={busy} />
          </label>
          <p className="muted">Reuse the same ID for images of the same physical part.</p>
          <div className="demo-actions">
            <button disabled={!canLabel} onClick={() => labelPhoto('PASS')}>Label PASS</button>
            <button className="secondary" disabled={!canLabel} onClick={() => labelPhoto('FAIL')}>Label FAIL</button>
          </div>
          {availability && <p className="notice" role="status">{availability}</p>}
        </> : <>
          <label className="demo-field">Check type
            <select value={engine} disabled={busy}
              onChange={event => selectEngine(event.target.value as typeof engine)}>
              <option value="yolo">Count parts</option>
              <option value="analyze">Analyze image</option>
              <option value="qwen">Check a written rule</option>
            </select>
          </label>
          {engine === 'analyze' && <p className="muted">
            YOLO counts objects. Qwen describes the scene. <a
              href="https://huggingface.co/Qwen/Qwen2.5-VL-3B-Instruct" target="_blank"
              rel="noreferrer">Qwen model card</a>
          </p>}
          {engine === 'yolo' ? <>
            <label className="demo-field">Part to count
              <select value={target} disabled={busy || model?.status !== 'ready'} onChange={event => {
                setTarget(event.target.value);
                setCompleted(null);
              }}>
                <option value="">Choose a part</option>
                {model?.classes.map(label => <option key={label}>{label}</option>)}
              </select>
            </label>
            <label className="demo-field">How many should be there?
              <input type="number" min={1} max={999} value={expectedCount} disabled={busy}
                onChange={event => { setExpectedCount(event.target.value); setCompleted(null); }} />
            </label>
            <details className="check-options">
              <summary>Model settings</summary>
              {modelReady && <p className="muted">Loaded: {model.model}</p>}
              <div className="demo-actions">
                <button className="secondary" disabled={busy}
                  onClick={() => { setCompleted(null); setModelRefresh(value => value + 1); }}>Refresh model</button>
                {personDemoAvailable && <button className="secondary" disabled={busy}
                  onClick={usePersonDemo}>Use person demo</button>}
              </div>
              <label className="demo-field">Minimum confidence (%)
                <input type="number" min={1} max={100} value={confidence} disabled={busy}
                  onChange={event => { setConfidence(event.target.value); setCompleted(null); }} />
              </label>
              <p className="muted">Parts below this confidence level aren’t counted.</p>
            </details>
          </> : engine === 'qwen' && <label className="demo-field">What should a good part look like?
            <textarea value={rule} maxLength={400} disabled={busy} rows={4}
              placeholder="For example, each package should have a readable label."
              onChange={event => { update({ acceptanceRule: event.target.value }); setCompleted(null); }} />
          </label>}
          {engine === 'yolo' && !modelReady && <p className="notice" role="status">
            {modelError || model?.status === 'unavailable' ? 'Counting model unavailable. '
              : model?.status === 'missing' ? 'No counting model loaded. ' : 'Checking model availability…'}
            {(modelError || model?.status === 'missing' || model?.status === 'unavailable') &&
              <a href="#models">Train or load a model</a>}
          </p>}
          <button disabled={!image || !canInspect || busy} onClick={() => void inspect(image)}>{engine === 'analyze' ? 'Analyze this photo' : 'Check this photo'} <span aria-hidden="true">→</span></button>
          {(result || inspecting) && <section className="check-result" aria-labelledby="check-result-heading">
            <h3 id="check-result-heading">Check result</h3>
            <div className="result-box" role="status">
              {inspecting ? engine === 'analyze' ? 'Analyzing photo…' : 'Checking photo…' : result
                ? <><strong className={`badge ${result.decision.toLowerCase()}`}>{result.decision}</strong>
                  {engine === 'yolo' && result.decision !== 'HOLD' && result.detections &&
                    <dl className="check-counts">
                      <div><dt>Expected</dt><dd>{count}</dd></div>
                      <div><dt>Found</dt><dd>{result.detections.length}</dd></div>
                    </dl>}
                  <p>{result.reason}</p>
                  {engine === 'yolo' && result.detections && <small>
                    Green boxes show parts found. The photo border shows the overall result.
                  </small>}</>
                : null}
            </div>
          </section>}
          {analysis && <section className="check-result" aria-label="Image analysis" role="status">
            {analysis.error ? <p>{analysis.error}</p> : <>
              <h3>Objects YOLO found</h3>
              {analysis.detection_error ? <p>{analysis.detection_error}</p>
                : Object.keys(analysis.counts).length ? <ul>
                  {Object.entries(analysis.counts).map(([label, count]) =>
                    <li key={label}>{label} × {count}</li>)}
                </ul> : <p>No objects detected.</p>}
              <h3>Qwen scene description</h3>
              <p>{analysis.description.text ?? analysis.description.error}</p>
            </>}
          </section>}
        </>}
      </article>
    </div>
    {!training && preview && !!detections?.length && <details className="panel saved-panel">
      <summary>See individual detections</summary>
      <div className="detection-crops">
        {detections.map((box, index) => {
          const width = box.x2 - box.x1;
          const height = box.y2 - box.y1;
          return <figure key={index}>
            <div className="detection-crop" style={{ aspectRatio: frameRatio * width / height }}>
              <img src={preview} alt={`${box.label} ${index + 1}`} style={{
                width: `${100 / width}%`, left: `${-100 * box.x1 / width}%`,
                top: `${-100 * box.y1 / height}%`,
              }} />
            </div>
            <figcaption>{box.label} {index + 1} · {Math.round(box.confidence * 100)}%</figcaption>
          </figure>;
        })}
      </div>
    </details>}
    {training && <section className="panel saved-panel">
      <h2>Saved examples</h2>
      {ready && examples.length === 0 && <p className="muted">No saved examples yet.</p>}
      <div className="card-grid">{examples.map(example => <article className="example-card" key={example.id}>
        <img loading="lazy" className="demo-image" src={exampleImage(example.id)}
          alt={`Example for ${example.part_id}`} />
        <div><strong>{example.part_id}</strong><span className={`badge ${example.label.toLowerCase()}`}>{example.label}</span></div>
      </article>)}</div>
    </section>}
  </>;
}
