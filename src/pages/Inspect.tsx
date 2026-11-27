import { useEffect, useState } from 'react';

import { useWorkspace } from '../context/WorkspaceContext';
import { listCompletedJobs, listTrainingDatasets, type ProjectSummary, type TrainingJob } from '../services/api/trainingDatasets';
import { Icon } from '../ui/Icon';
import { ErrorBox, Loading, errorText, projectHref } from '../ui/common';
import { useLocation } from '../ui/navigation';
import { DemoTester, ModelTester, versionName } from './ModelTester';

export function Inspect() {
  const { searchParams } = new URL(useLocation(), window.location.origin);
  const project = searchParams.get('project') ?? '';
  return <InspectionWorkspace key={project} initialProject={project} />;
}

function InspectionWorkspace({ initialProject }: { initialProject: string }) {
  const [mode, setMode] = useState<'demo' | 'trained'>(() => initialProject ? 'trained' : 'demo');

  return <main className="page wide">
    <header className="page-head">
      <div>
        <h1>Inspect</h1>
        <p>{mode === 'demo'
          ? 'Find people and common objects in a sample photo, your own photo, or a camera capture.'
          : 'Check a photo or camera capture with a model trained in your workspace.'}</p>
      </div>
      <div className="seg" role="group" aria-label="Model source">
        <button type="button" aria-pressed={mode === 'demo'} onClick={() => setMode('demo')}>Detection demo</button>
        <button type="button" aria-pressed={mode === 'trained'} onClick={() => setMode('trained')}>Your trained models</button>
      </div>
    </header>
    {mode === 'demo' ? <DemoTester /> : <TrainedModels initialProject={initialProject} />}
  </main>;
}

function TrainedModels({ initialProject }: { initialProject: string }) {
  const { org } = useWorkspace();
  const orgId = org!.org_id;
  const [projects, setProjects] = useState<ProjectSummary[] | null>(null);
  const [projectId, setProjectId] = useState(initialProject);
  const [models, setModels] = useState<TrainingJob[] | null>(null);
  const [modelId, setModelId] = useState('');
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setError('');
    listTrainingDatasets(orgId, controller.signal).then(items => {
      const ready = items.filter(item => item.model_count > 0);
      setProjects(ready);
      setProjectId(current => ready.some(item => item.id === current) ? current : ready[0]?.id ?? '');
    }).catch(cause => {
      if (!controller.signal.aborted) setError(errorText(cause, 'Could not load projects.'));
    });
    return () => controller.abort();
  }, [orgId, attempt]);

  useEffect(() => {
    if (!projectId) return;
    const controller = new AbortController();
    setModels(null);
    setModelId('');
    listCompletedJobs(orgId, projectId, controller.signal).then(setModels).catch(cause => {
      if (!controller.signal.aborted) setError(errorText(cause, 'Could not load models.'));
    });
    return () => controller.abort();
  }, [orgId, projectId]);

  const project = projects?.find(item => item.id === projectId);
  const model = models?.find(item => item.id === modelId) ?? models?.[0];

  return <>
      {projects && projects.length > 0 && <div className="toolbar">
        <label className="field" style={{ minWidth: 220 }}>Project
          <select value={projectId} onChange={event => setProjectId(event.target.value)}>
            {projects.map(item => <option key={item.id} value={item.id}>{item.part_name}</option>)}
          </select>
        </label>
        {models && models.length > 0 && <label className="field" style={{ minWidth: 200 }}>Model version
          <select value={model?.id ?? ''} onChange={event => setModelId(event.target.value)}>
            {models.map(item => <option key={item.id} value={item.id}>{versionName(item, models)}</option>)}
          </select>
        </label>}
      </div>}

    {error && <ErrorBox message={error} onRetry={() => setAttempt(value => value + 1)} />}
    {!projects && !error && <Loading />}
    {projects && projects.length === 0 && <div className="empty">
      <span className="bubble"><Icon name="inspect" /></span>
      <h2>No trained models yet</h2>
      <p className="muted" style={{ maxWidth: '44ch' }}>Create a project, label your photos and train a model. It will appear here, ready to check new parts.</p>
      <a className="btn" href="/projects">Go to projects</a>
    </div>}
    {project && !models && <Loading label="Loading models…" />}
    {project && model && <>
      <div className="row">
        <span className="chip plain">{project.part_name}</span>
        <span className="chip">{versionName(model, models!)}</span>
        <span className="spacer" />
        <a className="btn link small" href={projectHref(orgId, project.id, 'test')}>Open project <Icon name="arrow" /></a>
      </div>
      <ModelTester key={model.id} orgId={orgId} datasetId={project.id} model={model} labels={project.classes}
        kindOf={label => project.class_info?.[label]?.kind ?? 'object'} />
    </>}
  </>;
}
