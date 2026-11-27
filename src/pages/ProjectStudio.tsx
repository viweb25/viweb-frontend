import { useEffect, useState } from 'react';

import { Topbar } from '../App';
import { useWorkspace } from '../context/WorkspaceContext';
import { listCompletedJobs, type TrainingJob } from '../services/api/trainingDatasets';
import { Icon, type IconName } from '../ui/Icon';
import { ErrorBox, Loading, STEPS, projectHref, type Step } from '../ui/common';
import { MIN_PHOTOS_TO_TRAIN, useProject, type Project } from './project/useProject';
import { DetectStep } from './steps/DetectStep';
import { LabelStep } from './steps/LabelStep';
import { TestStep } from './steps/TestStep';
import { TrainStep } from './steps/TrainStep';
import { UploadStep } from './steps/UploadStep';
import { UseStep } from './steps/UseStep';

const STEP_INFO: Record<Step, { label: string; icon: IconName; tip: string }> = {
  detect: { label: 'Set up', icon: 'sliders', tip: 'Name the project and what to find, good or bad' },
  upload: { label: 'Photos', icon: 'camera', tip: 'Add photos like the ones your camera will see' },
  label: { label: 'Label', icon: 'box', tip: 'Draw a box around each thing in each photo' },
  train: { label: 'Train', icon: 'play', tip: 'Let the model learn from your boxes' },
  test: { label: 'Test', icon: 'inspect', tip: 'Try the model on new photos' },
  use: { label: 'Use', icon: 'rocket', tip: 'Download the model or inspect parts' },
};

function SaveState({ project }: { project: Project }) {
  if (project.saveError) return <span className="save-state" role="alert"><Icon name="alert" /> Not saved
    <button type="button" className="btn link small" onClick={() => void project.save().catch(() => undefined)}>Retry</button></span>;
  if (project.saving || project.saveMessage) return <span className="save-state" role="status">
    <span className="spinner" style={{ width: 14, height: 14 }} />{project.saveMessage || 'Saving…'}</span>;
  if (project.dirty) return <span className="save-state"><Icon name="clock" /> Unsaved changes</span>;
  if (project.status === 'ready' && project.canEdit) return <span className="save-state"><Icon name="check" /> Saved</span>;
  return null;
}

export function ProjectStudio({ orgId, datasetId, step }: { orgId: string; datasetId: string; step: Step }) {
  const { canEdit } = useWorkspace();
  const project = useProject(orgId, datasetId, canEdit);
  const [models, setModels] = useState<TrainingJob[] | null>(null);
  const [modelsVersion, setModelsVersion] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    listCompletedJobs(orgId, datasetId, controller.signal).then(setModels).catch(() => {
      if (!controller.signal.aborted) setModels([]);
    });
    return () => controller.abort();
  }, [orgId, datasetId, modelsVersion]);

  useEffect(() => { window.scrollTo(0, 0); }, [step]);

  useEffect(() => {
    if (project.name) document.title = `${project.name} · Vision Studio`;
  }, [project.name]);

  const done: Record<Step, boolean> = {
    upload: project.photos.length >= MIN_PHOTOS_TO_TRAIN,
    detect: project.labels.length > 0,
    label: project.photos.length > 0 && !project.blockedReason,
    train: !!models?.length,
    test: false,
    use: false,
  };

  return <>
    <Topbar right={<SaveState project={project} />} compact>
      <div className="crumb">
        <a href="/projects"><Icon name="back" /><span className="lbl-hide">Projects</span></a>
        <span aria-hidden="true">/</span>
        <strong title={project.name}>{project.name || '…'}</strong>
      </div>
      <ol className="stepper" aria-label="Project steps">
        {STEPS.map((item, index) => {
          const current = item === step;
          const state = current ? 'current' : done[item] ? 'done' : '';
          const info = STEP_INFO[item];
          return <li key={item} className={state}>
            <a href={projectHref(orgId, datasetId, item)} aria-current={current ? 'step' : undefined} title={`${index + 1}. ${info.label}: ${info.tip}`}>
              <span className="n">{done[item] && !current ? <Icon name="check" /> : index + 1}</span>
              <span className="lbl"><Icon name={info.icon} />{info.label}</span>
            </a>
          </li>;
        })}
      </ol>
    </Topbar>
    {project.status === 'loading' && <main className="page"><Loading label="Opening project…" /></main>}
    {project.status === 'error' && <main className="page narrow"><ErrorBox message={project.loadError} onRetry={project.reload} /></main>}
    {project.status === 'ready' && <>
      {step === 'upload' && <UploadStep project={project} orgId={orgId} datasetId={datasetId} />}
      {step === 'detect' && <DetectStep project={project} orgId={orgId} datasetId={datasetId} />}
      {step === 'label' && <LabelStep project={project} orgId={orgId} datasetId={datasetId} models={models ?? []} />}
      {step === 'train' && <TrainStep project={project} orgId={orgId} datasetId={datasetId}
        onModelsChanged={() => setModelsVersion(value => value + 1)} />}
      {step === 'test' && <TestStep project={project} orgId={orgId} datasetId={datasetId} models={models} />}
      {step === 'use' && <UseStep project={project} orgId={orgId} datasetId={datasetId} models={models} />}
    </>}
  </>;
}
