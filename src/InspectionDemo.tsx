import { useCallback, useEffect, useRef, useState, type ChangeEvent } from 'react';

import { useWorkspacePreferences } from './context/WorkspacePreferences';
import { inspectImage, type InspectionResult } from './services/api/inspection';
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
  const [completed, setCompleted] = useState<{ rule: string; result: InspectionResult } | null>(null);
  const result = completed?.rule === rule.trim() ? completed.result : null;
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

  async function capture() {
    const frame = video.current;
    if (!frame?.videoWidth || stream.current?.getVideoTracks()[0]?.readyState !== 'live') {
      setMessage('Start a video source before capturing a frame.');
      return;
    }
    setBusy(true);
    setCompleted(null);
    setImage(null);
    try {
      setImage(await makeJpeg(frame, frame.videoWidth, frame.videoHeight));
      setMessage('');
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
      try {
        setImage(await makeJpeg(bitmap, bitmap.width, bitmap.height));
        setMessage('');
      } finally {
        bitmap.close();
      }
    } catch {
      setMessage('Could not open that photo. Try a JPEG or PNG.');
    } finally {
      setBusy(false);
    }
  }

  async function inspect() {
    if (!image) return;
    setBusy(true);
    setInspecting(true);
    setCompleted(null);
    try {
      const response = await inspectImage(rule.trim(), image);
      setCompleted({ rule: rule.trim(), result: response });
      onResult(response);
    } catch {
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

  if (!mode) return null;

  return <>
    <div className="workbench">
      <article className="panel">
        <h2>Image source</h2>
        {cameraSupported ? <>
          <label className="demo-field">Camera
            <select value={cameraChoice} disabled={busy || activeSource === 'camera'}
              onChange={event => setCameraChoice(event.target.value)}>
              <option value="default">Default camera</option>
              {navigator.mediaDevices.getSupportedConstraints().facingMode &&
                <option value="rear">Prefer rear camera</option>}
              {cameras.map((camera, index) => <option key={camera.deviceId} value={`device:${camera.deviceId}`}>
                {camera.label || `Camera ${index + 1}`}
              </option>)}
            </select>
          </label>
        </> : <p className="muted">Use a supported browser on localhost or an HTTPS dashboard for live camera access.</p>}
        {(cameraSupported || activeSource) && <div className="demo-actions">
          {activeSource ? <button className="secondary" disabled={busy} onClick={stopVideo}>
            Stop {activeSource === 'camera' ? 'camera' : 'sharing'}
          </button> : <button className="secondary" disabled={busy} onClick={() => startVideo('camera')}>
            Start camera
          </button>}
          <button className="secondary" disabled={!cameraReady || busy} onClick={capture}>Capture frame</button>
        </div>}
        <div className="demo-actions">
          {sharingSupported && <button className="secondary" disabled={busy || !!activeSource}
            onClick={() => startVideo('viewer')}>
            Share camera viewer
          </button>}
          <button className="secondary" disabled={busy} onClick={() => photoInput.current?.click()}>
            Take a photo
          </button>
          <button className="secondary" disabled={busy} onClick={() => uploadInput.current?.click()}>
            Upload image
          </button>
          <input ref={photoInput} type="file" accept="image/*" capture="environment" hidden
            onChange={choosePhoto} />
          <input ref={uploadInput} type="file" accept="image/*" hidden onChange={choosePhoto} />
        </div>
        <details className="camera-help">
          <summary>Which option should I use?</summary>
          <ul>
            <li>For a webcam, USB camera, or HDMI capture device, select the camera and click Start camera.</li>
            <li>On a phone or tablet, Take a photo opens the device camera when supported. Upload image opens a saved photo.</li>
            <li>For CCTV or industrial cameras, open the live feed in its viewer, then share that window or tab in a supported desktop browser.</li>
          </ul>
        </details>
        <video className="demo-image" ref={video} hidden={!cameraReady} muted playsInline
          onPlaying={() => { if (stream.current) setCameraReady(true); }} />
        {preview
          ? <img className="demo-image image-preview" src={preview} alt="Selected image" />
          : <div className="image-placeholder">Capture a frame or upload an image</div>}
        {message && <p className="muted" role="status">{message}</p>}
      </article>
      <article className="panel">
        <h2>{training ? 'Label example' : 'Inspection result'}</h2>
        {training ? <>
          <label className="demo-field">Physical part ID
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
          <label className="demo-field">Acceptance rule
            <textarea value={rule} maxLength={400} disabled={busy} rows={4}
              placeholder="Describe what an acceptable part looks like"
              onChange={event => { update({ acceptanceRule: event.target.value }); setCompleted(null); }} />
          </label>
          <button disabled={!image || !rule.trim() || busy} onClick={inspect}>Inspect image <span aria-hidden="true">→</span></button>
          <div className="result-box" role="status">
            {inspecting ? 'Inspecting image…' : result
              ? <><strong className={`badge ${result.decision.toLowerCase()}`}>{result.decision}</strong>
                <p>{result.reason}</p>{result.model && <small>{result.model}</small>}</>
              : 'The model decision will appear here.'}
          </div>
        </>}
      </article>
    </div>
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
