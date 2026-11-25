import { useState } from 'react';

import type { TrainingJob } from '../../services/api/trainingDatasets';
import { Icon } from '../../ui/Icon';
import { Loading, projectHref } from '../../ui/common';
import { ModelTester, ScoreTable, VersionList } from '../ModelTester';
import type { Project } from '../ProjectStudio';

export function NoModelYet({ orgId, datasetId }: { orgId: string; datasetId: string }) {
  return <div className="empty">
    <span className="bubble"><Icon name="cpu" /></span>
    <h2>No trained model yet</h2>
    <p className="muted">Train a model first. When it finishes, you can test it here.</p>
    <a className="btn" href={projectHref(orgId, datasetId, 'train')}><Icon name="play" /> Go to training</a>
  </div>;
}

export function TestStep({ project, orgId, datasetId, models }: {
  project: Project;
  orgId: string;
  datasetId: string;
  models: TrainingJob[] | null;
}) {
  const [selected, setSelected] = useState('');
  if (!models) return <main className="page"><Loading label="Loading models…" /></main>;
  const model = models.find(item => item.id === selected) ?? models[0];

  return <main className="page wide">
    <header className="page-head">
      <div>
        <span className="eyebrow">Step 4 of 5</span>
        <h1 style={{ marginTop: '.3rem' }}>Test your model</h1>
        <p>Try photos the model has never seen. Check that it finds the right objects before you use it.</p>
      </div>
      {model && <a className="btn" href={projectHref(orgId, datasetId, 'use')}>Next: Use model <Icon name="arrow" /></a>}
    </header>
    {!model ? <NoModelYet orgId={orgId} datasetId={datasetId} /> : <div className="test-layout">
      <aside className="stack" style={{ gap: '1rem' }}>
        <section className="card side-card">
          <h3>Model version</h3>
          <VersionList models={models} selected={model.id} onSelect={setSelected} />
        </section>
        <div className="notice small"><Icon name="info" /><span>If it misses objects, add more photos like the ones it struggles with, label them, and train again.</span></div>
      </aside>
      <ModelTester key={model.id} orgId={orgId} datasetId={datasetId} model={model} labels={project.labels} kindOf={project.kindOf} />
    </div>}
    {models.length > 1 && <section className="card">
      <div className="card-head"><h2>Compare versions</h2><span className="muted small">Scores from each run’s held-out test photos</span></div>
      <ScoreTable models={models} />
    </section>}
  </main>;
}
