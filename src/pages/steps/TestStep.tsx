import { useState } from 'react';

import type { TrainingJob } from '../../services/api/trainingDatasets';
import { Icon, type IconName } from '../../ui/Icon';
import { TeachingLoop } from '../../ui/Illustrations';
import { Loading, projectHref } from '../../ui/common';
import { ModelTester, ScoreTable, VersionList } from '../ModelTester';
import type { Project } from '../project/useProject';

export function NoModelYet({ orgId, datasetId }: { orgId: string; datasetId: string }) {
  return <div className="empty">
    <span className="bubble"><Icon name="cpu" /></span>
    <h2>No trained model yet</h2>
    <p className="muted">Train a model first. When it finishes, you can test it here.</p>
    <a className="btn" href={projectHref(orgId, datasetId, 'train')}><Icon name="play" /> Go to training</a>
  </div>;
}

const FIXES: { icon: IconName; problem: string; fix: string }[] = [
  { icon: 'eye', problem: 'It misses objects', fix: 'Add photos where it missed them, box every object, train again.' },
  { icon: 'alert', problem: 'It finds things that are not there', fix: 'Add more empty photos and mark them “nothing to label”.' },
  { icon: 'tag', problem: 'It mixes up two classes', fix: 'Add more photos of both classes. Check that old boxes use the right class.' },
  { icon: 'target', problem: 'Boxes are in the wrong place', fix: 'Redraw loose boxes so they touch the object edges.' },
];

/** What to do when the model makes a mistake: the teaching loop. */
function ImproveCard({ orgId, datasetId }: { orgId: string; datasetId: string }) {
  return <section className="card explain loop-card">
    <TeachingLoop current="test" />
    <div className="stack" style={{ gap: '.8rem' }}>
      <h2><Icon name="refresh" /> Make it better</h2>
      <ul className="fix-list">
        {FIXES.map(item => <li key={item.problem}>
          <span className="fix-icon"><Icon name={item.icon} /></span>
          <span><b>{item.problem}</b><small>{item.fix}</small></span>
        </li>)}
      </ul>
      <div className="row">
        <a className="btn ghost small" href={projectHref(orgId, datasetId, 'upload')}><Icon name="upload" /> Add photos</a>
        <a className="btn ghost small" href={projectHref(orgId, datasetId, 'label')}><Icon name="tag" /> Fix labels</a>
        <a className="btn ghost small" href={projectHref(orgId, datasetId, 'train')}><Icon name="play" /> Train again</a>
      </div>
    </div>
  </section>;
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
        <span className="eyebrow"><Icon name="inspect" /> Step 4 of 5</span>
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
    {model && <ImproveCard orgId={orgId} datasetId={datasetId} />}
    {models.length > 1 && <section className="card">
      <div className="card-head"><h2>Compare versions</h2><span className="muted small">Scores from each run’s held-out test photos</span></div>
      <ScoreTable models={models} />
    </section>}
  </main>;
}
