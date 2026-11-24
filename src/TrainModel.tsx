import { useEffect, useState } from 'react';

import {
  loadTrainingJob, type TrainingJob,
} from './services/api/trainingDatasets';

type Props = {
  orgId: string;
  datasetId: string;
  revision: number;
  canEdit: boolean;
  busy: boolean;
  dirty: boolean;
  canSave: boolean;
  blockedReason: string;
  onSubmit: (train: boolean) => Promise<TrainingJob | undefined>;
};

const jobStatus = {
  queued: 'Training queued. The worker will pick it up shortly.',
  running: 'Your model is learning from your photos. You can leave this page and come back.',
  succeeded: 'Training complete. Your model is ready to test.',
  failed: 'Training failed.',
};

export function TrainModel({
  orgId, datasetId, revision, canEdit, busy, dirty, canSave, blockedReason, onSubmit,
}: Props) {
  const [job, setJob] = useState<TrainingJob | null>(null);
  const [starting, setStarting] = useState(false);
  const [statusError, setStatusError] = useState('');
  const saved = revision > 0;
  const active = job?.status === 'queued' || job?.status === 'running';

  useEffect(() => {
    const controller = new AbortController();
    let nextCheck: ReturnType<typeof setTimeout>;
    async function check() {
      try {
        const result = await loadTrainingJob(orgId, datasetId, controller.signal);
        if (controller.signal.aborted) return;
        setJob(result);
        setStatusError('');
        if (result?.status !== 'queued' && result?.status !== 'running') return;
      } catch {
        if (controller.signal.aborted) return;
        setStatusError('Could not check training status. Retrying…');
      }
      nextCheck = setTimeout(() => void check(), 3000);
    }
    if (saved && !starting) void check();
    return () => {
      controller.abort();
      clearTimeout(nextCheck);
    };
  }, [orgId, datasetId, saved, starting]);

  async function start() {
    setStarting(true);
    try {
      const started = await onSubmit(true);
      if (started) setJob(started);
    } finally {
      setStarting(false);
    }
  }

  return (
    <section className="training-footer" aria-label="Model training">
      {canEdit && <div className="label-actions">
        <button type="button" disabled={busy || starting || active || !!blockedReason}
          onClick={() => void start()}>{dirty || !saved ? 'Save and train' : 'Train model'}</button>
        <button type="button" className="secondary" disabled={busy || starting || !canSave || !dirty}
          onClick={() => void onSubmit(false)}>Save draft</button>
      </div>}
      {canEdit && blockedReason && <p>{blockedReason}</p>}
      <div role="status">
        {job && <p>{jobStatus[job.status]} {job.error?.replace('YOLO', 'The model')}</p>}
        {job && job.dataset_revision !== revision && <p>This run used an earlier saved version.</p>}
      </div>
      {saved && <a className="button secondary" href={`#test?${new URLSearchParams({ org: orgId, dataset: datasetId })}`}>
        Test this model
      </a>}
      {statusError && <p role="status">{statusError}</p>}
    </section>
  );
}
