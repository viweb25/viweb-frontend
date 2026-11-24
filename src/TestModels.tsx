import { useEffect, useState } from 'react';

import { useSession } from './context/SessionContext';
import { listTrainingDatasets, openTrainingDataset, type TrainingDataset } from './services/api/trainingDatasets';
import { TrainedModelPicker } from './TrainedModelPicker';

export function TestModels({ selection }: { selection: string }) {
  const { user } = useSession();
  const params = new URLSearchParams(selection);
  const requestedOrg = params.get('org');
  const [orgId, setOrgId] = useState(
    user.organisations.find(org => org.org_id === requestedOrg)?.org_id
      ?? user.organisations[0]?.org_id ?? '',
  );

  if (!orgId) return <p className="notice">Join a company workspace to test a model.</p>;

  return <section className="panel model-test-page">
    <h2>Model test</h2>
    <p className="muted">Choose a photo set and a finished model, then add a new photo to run a check.</p>
    {user.organisations.length > 1 && <label className="demo-field">
      Company
      <select value={orgId} onChange={event => setOrgId(event.target.value)}>
        {user.organisations.map(org => <option key={org.org_id} value={org.org_id}>{org.name}</option>)}
      </select>
    </label>}
    <TestDataset key={orgId} orgId={orgId} initialDataset={
      orgId === requestedOrg ? params.get('dataset') ?? '' : ''
    } />
  </section>;
}

function TestDataset({ orgId, initialDataset }: { orgId: string; initialDataset: string }) {
  const [datasets, setDatasets] = useState<Pick<TrainingDataset, 'id' | 'part_name'>[] | null>(null);
  const [datasetId, setDatasetId] = useState(initialDataset);
  const [dataset, setDataset] = useState<TrainingDataset | null>(null);
  const [listError, setListError] = useState(false);
  const [openError, setOpenError] = useState('');
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setListError(false);
    listTrainingDatasets(orgId, controller.signal).then(items => {
      if (controller.signal.aborted) return;
      setDatasets(items);
      setDatasetId(previous => items.some(item => item.id === previous) ? previous : items.length === 1 ? items[0].id : '');
    }).catch(() => {
      if (!controller.signal.aborted) setListError(true);
    });
    return () => controller.abort();
  }, [orgId, attempt]);

  useEffect(() => {
    if (!datasetId) return;
    let active = true;
    setOpenError('');
    openTrainingDataset(orgId, datasetId).then(value => {
      if (active) setDataset(value);
    }).catch(() => {
      if (active) setOpenError('Could not open this photo set.');
    });
    return () => { active = false; };
  }, [orgId, datasetId, attempt]);

  if (listError) return <div role="alert">
    <p>Could not load your photo sets.</p>
    <button type="button" className="secondary" onClick={() => setAttempt(value => value + 1)}>Retry</button>
  </div>;
  if (!datasets) return <p role="status">Loading your photo sets…</p>;
  if (!datasets.length) return <>
    <h2>No photo sets yet</h2>
    <p>Train a model on photos of your parts to test it here.</p>
    <a className="button" href="#models">Train a model</a>
  </>;

  return <>
    <label className="demo-field">
      Photo set
      <select value={datasetId} onChange={event => {
        setDataset(null);
        setOpenError('');
        setDatasetId(event.target.value);
      }}>
        <option value="">Choose the part you trained on</option>
        {datasets.map(item => <option key={item.id} value={item.id}>{item.part_name}</option>)}
      </select>
    </label>
    {openError && <div role="alert">
      <p>{openError}</p>
      <button type="button" className="secondary" onClick={() => setAttempt(value => value + 1)}>Retry</button>
    </div>}
    {datasetId && !openError && (dataset?.id === datasetId
      ? <TrainedModelPicker key={datasetId} orgId={orgId} datasetId={datasetId}
          revision={dataset.revision} partName={dataset.part_name} />
      : <p role="status">Opening photo set…</p>)}
  </>;
}
