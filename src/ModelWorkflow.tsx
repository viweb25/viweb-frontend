import { useState } from 'react';

const compose = 'docker compose -f compose.yaml -f compose.separate.yaml';
const train = `${compose} --profile training run --build --rm trainer`;
const activate = `cp "runs/<run-folder>/weights/best.pt" models/best.pt &&\n${compose} restart inference`;

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
      <h2>Prepare camera photos</h2>
      <ol>
        <li>Capture your own line under normal production conditions. Include good parts,
          missing and extra parts, and empty frames.</li>
        <li>Draw a box around each part you want to count and give it a class, such as <code>cap</code>.
          Export in YOLO detection format.</li>
        <li>Split by batch or capture session into training, validation, and test sets.
          Extract the export to <code>viweb-local-stack/datasets/</code> with
          <code> data.yaml</code> at its top level.</li>
      </ol>
    </article>
    <article className="panel workflow-stage">
      <h2>Fine-tune YOLO</h2>
      <p>Start with the pretrained YOLO11n model and teach it your part classes.
        Run this from <code>viweb-local-stack</code>.</p>
      <Command command={train} />
      <p>Add <code>--epochs 1</code> for a quick dataset and trainer check.</p>
      <details className="check-options">
        <summary>Train with new weights from scratch</summary>
        <p>This uses the YOLO11n architecture with randomly initialized weights.
          It typically needs more labeled data and compute.</p>
        <Command command={`${train} --from-scratch`} />
        <p>Building your own architecture is a separate project. First measure the fine-tuned model
          on held-out production images to see which errors a new design would need to solve.</p>
      </details>
    </article>
    <article className="panel workflow-stage">
      <h2>Test and load</h2>
      <p>Review the results under <code>runs/</code>. Check for missed parts and false detections on
        held-out images, including trays with missing or extra parts.</p>
      <p>Use the run folder printed by the trainer in place of <code>&lt;run-folder&gt;</code>.</p>
      <Command command={activate} />
      <p>Open <a href="#inspection">Check parts</a>, expand Model settings, and select Refresh model.
        Choose your part class and try a saved production photo.</p>
    </article>
  </div>;
}
