import { useState } from 'react';

const train = 'docker compose --profile training run --build --rm trainer';
const activate = 'cp runs/object-detection/weights/best.pt models/best.pt\nINFERENCE_TARGET=yolo docker compose up -d --build --wait\ndocker compose restart inference';

function Command({ command }: { command: string }) {
  const [copyStatus, setCopyStatus] = useState('');
  return <div className="workflow-command">
    <pre><code>{command}</code></pre>
    {navigator.clipboard && <button type="button" className="secondary" onClick={async () => {
      try {
        await navigator.clipboard.writeText(command);
        setCopyStatus('Copied.');
      } catch {
        setCopyStatus('Select and copy the command above.');
      }
    }}>Copy command</button>}
    {copyStatus && <span className="workflow-copy-status" role="status">{copyStatus}</span>}
  </div>;
}

export function ModelWorkflow() {
  return <div className="model-workflow">
    <article className="panel workflow-stage">
      <header><h2>Prepare a dataset</h2><p>Use your industrial camera and label what the model should find.</p></header>
      <ol>
        <li>Capture full frames at the working distance and lighting. Include correctly arranged parts,
          missing or extra parts, different orientations, and empty frames.</li>
        <li>Create a private Object Detection project in JTheta.ai and name the dataset, for example
          <code> line-01-cap-detection-v1</code>. Upload the frames and add a class for each object,
          such as <code>cap</code> or <code>washer</code>.</li>
        <li>Use AI-assisted pre-labeling where available. Review and correct every bounding box.
          Split by production batch or capture session, then export YOLO detection format.</li>
        <li>Extract the export into <code>viweb-local-stack/datasets/</code>. Put
          <code> data.yaml</code> at that folder’s top level. Use <code>path: .</code> and relative image directories for each split.</li>
      </ol>
      <a className="button secondary" href="https://jtheta.ai/" target="_blank" rel="noreferrer">Open JTheta.ai</a>
      <a className="workflow-link" href="#training">Capture reference images</a>
    </article>
    <article className="panel workflow-stage">
      <header><h2>Train and validate</h2><p>Fine-tune an Ultralytics YOLO detector on the exported boxes and classes.</p></header>
      <p>Run from <code>viweb-local-stack</code>. The trainer prints progress and saves the candidate
        checkpoint, validation charts, and <code>results.csv</code> under <code>runs/</code>.</p>
      <Command command={train} />
      <p>Review precision, recall, and mAP together with predictions on held-out camera frames.
        Check normal, missing-part, and extra-part cases before choosing a checkpoint.</p>
    </article>
    <article className="panel workflow-stage">
      <header><h2>Load the model</h2><p>Promote a reviewed checkpoint to the inspection service.</p></header>
      <Command command={activate} />
      <p>Replace <code>runs/object-detection</code> with the actual run folder printed by the trainer.
        Restarting inference reloads the checkpoint.</p>
    </article>
    <article className="panel workflow-stage">
      <header><h2>Connect and inspect</h2><p>See what the camera sees, then run detection on a captured frame.</p></header>
      <ol>
        <li>Select a browser-visible camera or share the industrial camera’s manufacturer viewer.</li>
        <li>Choose a trained class and set the expected count. Click <strong>Capture &amp; detect</strong>,
          or upload a saved frame and choose <strong>Detect now</strong>.</li>
        <li>Review the boxes, confidence scores, individual crops, and the PASS, FAIL, or HOLD result.</li>
      </ol>
      <a className="button" href="#inspection">Open inspection</a>
    </article>
  </div>;
}
