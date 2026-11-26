import { useState } from 'react';

import { checkpointUrl, type TrainingJob } from '../../services/api/trainingDatasets';
import { Icon } from '../../ui/Icon';
import { Loading, projectHref, useToast } from '../../ui/common';
import { ScoreTable, VersionList, versionName } from '../ModelTester';
import type { Project } from '../project/useProject';
import { NoModelYet } from './TestStep';

export function UseStep({ project, orgId, datasetId, models }: {
  project: Project;
  orgId: string;
  datasetId: string;
  models: TrainingJob[] | null;
}) {
  const [selected, setSelected] = useState('');
  const toast = useToast();
  if (!models) return <main className="page"><Loading label="Loading models…" /></main>;
  const model = models.find(item => item.id === selected) ?? models[0];

  const snippet = `# pip install ultralytics
from ultralytics import YOLO

model = YOLO("best.pt")              # the file you downloaded
results = model.predict("photo.jpg", conf=0.5)

for box in results[0].boxes:
    print(model.names[int(box.cls)], float(box.conf))`;

  return <main className="page">
    <header className="page-head">
      <div>
        <span className="eyebrow">Step 5 of 5</span>
        <h1 style={{ marginTop: '.3rem' }}>Use your model</h1>
        <p>Check parts live in Vision Studio, or download the model to run it on your own machines.</p>
      </div>
    </header>
    {!model ? <NoModelYet orgId={orgId} datasetId={datasetId} /> : <>
      <div className="use-grid">
        <section className="card use-card">
          <span className="p-icon"><Icon name="camera" /></span>
          <h3>Inspect in the browser</h3>
          <p>Use a webcam or upload photos and get a pass or fail result for each part.</p>
          <a className="btn" href={`#/inspect?project=${encodeURIComponent(datasetId)}`}>Open Inspect <Icon name="arrow" /></a>
        </section>
        <section className="card use-card">
          <span className="p-icon"><Icon name="download" /></span>
          <h3>Download the model</h3>
          <p>PyTorch weights for {versionName(model, models)}. Works with Ultralytics on a PC, server, or edge device.</p>
          <div className="row">
            <a className="btn" href={checkpointUrl(orgId, datasetId, model.id)}><Icon name="download" /> best.pt</a>
            <a className="btn ghost" href={checkpointUrl(orgId, datasetId, model.id, 'last')}>last.pt</a>
          </div>
        </section>
        <section className="card use-card">
          <span className="p-icon"><Icon name="rocket" /></span>
          <h3>Improve it</h3>
          <p>Add photos of the cases it gets wrong, label them, and train a new version. Older versions stay available.</p>
          <a className="btn ghost" href={projectHref(orgId, datasetId, 'upload')}><Icon name="upload" /> Add more photos</a>
        </section>
      </div>

      <div className="test-layout">
        <section className="card side-card">
          <h3>Model version</h3>
          <VersionList models={models} selected={model.id} onSelect={setSelected} />
        </section>
        <section className="card side-card">
          <h3>Run it in Python</h3>
          <p className="small muted">Classes: {project.labels.join(', ')}</p>
          <div className="code-wrap">
            <pre className="code">{snippet}</pre>
            <button type="button" className="btn ghost small" onClick={() => {
              void navigator.clipboard?.writeText(snippet).then(() => toast('Copied to clipboard'));
            }}><Icon name="copy" /> Copy</button>
          </div>
          <p className="small muted">Export to ONNX, TensorRT, TFLite or CoreML with <code>model.export(format="onnx")</code> in Ultralytics.</p>
        </section>
      </div>

      {models.length > 0 && <section className="card">
        <div className="card-head"><h2>All versions</h2><span className="muted small">{models.length} trained</span></div>
        <ScoreTable models={models} />
      </section>}
    </>}
  </main>;
}
