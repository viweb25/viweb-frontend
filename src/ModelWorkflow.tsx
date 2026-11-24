import { useEffect, useState, type PointerEvent } from 'react';

import { TrainModel } from './TrainModel';
import { useSession } from './context/SessionContext';
import {
  listTrainingDatasets, openTrainingDataset, saveTrainingDataset, startTrainingJob, trainingPhotoUrl,
  uploadTrainingPhoto, type Box, type Point, type TrainingDataset, type TrainingPhoto,
} from './services/api/trainingDatasets';

type Photo = TrainingPhoto & { file?: File; savedUrl?: string };
const MAX_PHOTOS = 200;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

function pointOnPhoto(event: PointerEvent<HTMLImageElement>): Point {
  const rect = event.currentTarget.getBoundingClientRect();
  return {
    x: Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width)),
    y: Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height)),
  };
}

function usePhotoSource(photo: Photo) {
  const [url, setUrl] = useState('');

  useEffect(() => {
    if (!photo.file) return;
    const imageUrl = URL.createObjectURL(photo.file);
    setUrl(imageUrl);
    return () => URL.revokeObjectURL(imageUrl);
  }, [photo.file]);

  return photo.savedUrl ?? url;
}

function PhotoTile({ photo, index, selected, onSelect }: {
  photo: Photo;
  index: number;
  selected: boolean;
  onSelect: () => void;
}) {
  const source = usePhotoSource(photo);
  const status = photo.reviewed ? (photo.boxes.length ? 'Reviewed' : 'Part absent')
    : photo.boxes.length ? 'Boxes drawn' : 'Needs review';

  return (
    <button type="button" className="training-photo-tile" aria-pressed={selected}
      aria-label={`Photo ${index + 1}, ${photo.filename}, ${status}`} onClick={onSelect}>
      {source && <img src={source} alt="" loading="lazy" />}
      <span className="training-photo-name" title={photo.filename}>{photo.filename}</span>
      <span className={photo.reviewed ? 'training-photo-done' : ''}>{status}</span>
    </button>
  );
}

function PhotoLabeler({ photo, editable, onAddBox }: {
  photo: Photo;
  editable: boolean;
  onAddBox: (box: Box) => void;
}) {
  const source = usePhotoSource(photo);
  const [draft, setDraft] = useState<Box | null>(null);
  const [imageError, setImageError] = useState(false);

  if (imageError) return <p role="alert">This photo could not be displayed.</p>;

  return <div className={editable ? "label-photo is-editable" : "label-photo"}>
    {source && <img src={source} alt={photo.filename} draggable={false}
      onError={() => setImageError(true)}
      onPointerDown={event => {
        if (!editable || event.button !== 0 || !event.isPrimary) return;
        event.currentTarget.setPointerCapture(event.pointerId);
        const start = pointOnPhoto(event);
        setDraft({ start, end: start });
      }}
      onPointerMove={event => {
        if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
        const end = pointOnPhoto(event);
        setDraft(box => box && { ...box, end });
      }}
      onPointerUp={event => {
        if (!draft || !event.currentTarget.hasPointerCapture(event.pointerId)) return;
        const end = pointOnPhoto(event);
        const rect = event.currentTarget.getBoundingClientRect();
        if (Math.abs(draft.start.x - end.x) * rect.width >= 3 &&
            Math.abs(draft.start.y - end.y) * rect.height >= 3) {
          onAddBox({ start: draft.start, end });
        }
        setDraft(null);
      }}
      onLostPointerCapture={() => setDraft(null)}
    />}
    {(draft ? [...photo.boxes, draft] : photo.boxes).map(({ start, end }, index) => (
      <span className="label-box" key={index} aria-hidden="true" style={{
        left: `${Math.min(start.x, end.x) * 100}%`,
        top: `${Math.min(start.y, end.y) * 100}%`,
        width: `${Math.abs(start.x - end.x) * 100}%`,
        height: `${Math.abs(start.y - end.y) * 100}%`,
      }} />
    ))}
  </div>;
}

export function ModelWorkflow() {
  const { user } = useSession();
  const [orgId, setOrgId] = useState(user.organisations[0]?.org_id ?? '');
  const organisation = user.organisations.find(item => item.org_id === orgId);

  return <>
    {user.organisations.length > 1 && <label className="demo-field">
      Company
      <select value={organisation ? orgId : ''} onChange={event => {
        if (window.confirm('Switch company? Unsaved training changes will be discarded.')) {
          setOrgId(event.target.value);
        }
      }}>
        <option value="" disabled>Select a company</option>
        {user.organisations.map(item => <option key={item.org_id} value={item.org_id}>{item.name}</option>)}
      </select>
    </label>}
    {organisation
      ? <DatasetEditor key={orgId} orgId={orgId} canEdit={organisation.role !== 'viewer'} />
      : <p className="notice">Select a company to open training datasets.</p>}
  </>;
}

function DatasetEditor({ orgId, canEdit }: { orgId: string; canEdit: boolean }) {
  const [datasetId, setDatasetId] = useState<string>(() => crypto.randomUUID());
  const [revision, setRevision] = useState(0);
  const [saved, setSaved] = useState<Pick<TrainingDataset, 'id' | 'part_name'>[]>([]);
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [listError, setListError] = useState('');
  const [partName, setPartName] = useState('');
  const [inspectionRule, setInspectionRule] = useState('');
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const activePhoto = photos[activeIndex];
  const reviewedCount = photos.filter(photo => photo.reviewed).length;
  const allReviewed = photos.length > 0 && reviewedCount === photos.length;
  const part = partName.trim();
  const pendingBoxes = photos.filter(photo => !photo.reviewed && photo.boxes.length > 0).length;
  const trainingBlocked = !part
    ? 'Enter a part name to get started.'
    : photos.length < 4
      ? 'Add at least four different production photos.'
      : !allReviewed
        ? 'Confirm the boxes or mark the part absent in the remaining photos.'
        : photos.filter(photo => photo.boxes.length > 0).length < 2
          ? 'Include at least two different photos showing the part.'
          : '';

  useEffect(() => {
    const controller = new AbortController();
    listTrainingDatasets(orgId, controller.signal).then(setSaved).catch(() => {
      if (!controller.signal.aborted) setListError('Could not load saved datasets. Refresh to try again.');
    });
    return () => controller.abort();
  }, [orgId]);

  function newDataset() {
    if (dirty && !window.confirm('Start a new dataset and discard unsaved changes?')) return;
    setDatasetId(crypto.randomUUID());
    setRevision(0);
    setPartName('');
    setInspectionRule('');
    setPhotos([]);
    setActiveIndex(0);
    setDirty(false);
    setError('');
    setMessage('');
  }

  async function openDataset(id: string) {
    if (dirty && !window.confirm('Open a saved dataset and discard unsaved changes?')) return;
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const dataset = await openTrainingDataset(orgId, id);
      setDatasetId(dataset.id);
      setRevision(dataset.revision);
      setPartName(dataset.part_name);
      setInspectionRule(dataset.inspection_note);
      setPhotos(dataset.photos.map(photo => ({
        ...photo, savedUrl: trainingPhotoUrl(orgId, id, photo.id),
      })));
      setActiveIndex(0);
      setDirty(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not open the dataset.');
    } finally {
      setBusy(false);
    }
  }

  function addPhotos(files: File[]) {
    setError('');
    if (photos.length + files.length > MAX_PHOTOS) {
      setError(`A dataset can hold up to ${MAX_PHOTOS} photos.`);
      return;
    }
    if (files.some(file => !['image/jpeg', 'image/png'].includes(file.type) ||
      file.size === 0 || file.size > MAX_IMAGE_BYTES)) {
      setError('Choose JPEG or PNG photos that are 5 MiB or smaller.');
      return;
    }
    setDirty(true);
    setPhotos(current => [...current, ...files.map(file => ({
      id: crypto.randomUUID(), filename: file.name, media_type: file.type,
      digest: '', file, boxes: [], reviewed: false,
    }))]);
    if (allReviewed) setActiveIndex(photos.length);
    setMessage('');
  }

  async function persist() {
    const records = photos.map(({ file, savedUrl, ...record }) => record);
    const uploads = photos.flatMap((photo, index) => photo.file ? [{ file: photo.file, index }] : []);
    for (let offset = 0; offset < uploads.length; offset += 4) {
      const batch = uploads.slice(offset, offset + 4);
      setMessage(`Uploading photos ${offset + 1}–${offset + batch.length} of ${uploads.length}…`);
      const results = await Promise.allSettled(batch.map(async ({ file, index }) => {
        const record = records[index];
        record.digest = await uploadTrainingPhoto(orgId, datasetId, record.id, file);
      }));
      for (const result of results) {
        if (result.status === 'rejected') throw result.reason;
      }
    }
    setMessage('Saving dataset…');
    const { revision: nextRevision } = await saveTrainingDataset(orgId, {
      id: datasetId, revision, part_name: part, inspection_note: inspectionRule, photos: records,
    });
    setRevision(nextRevision);
    setPhotos(records.map(photo => ({
      ...photo, savedUrl: trainingPhotoUrl(orgId, datasetId, photo.id),
    })));
    setSaved(current => [
      { id: datasetId, part_name: part }, ...current.filter(dataset => dataset.id !== datasetId),
    ]);
    setDirty(false);
    setMessage('Dataset saved.');
    return nextRevision;
  }

  async function submit(train: boolean) {
    if (busy || !canEdit || !part || !photos.length) return;
    setBusy(true);
    setError('');
    setMessage('');
    let savedRevision = revision;
    try {
      if (dirty || !revision) savedRevision = await persist();
      if (train) {
        setMessage('Starting training…');
        const job = await startTrainingJob(orgId, datasetId, savedRevision);
        setMessage('');
        return job;
      }
    } catch (cause) {
      setMessage(train && savedRevision > 0 && (!dirty || savedRevision !== revision) ? 'Dataset saved.' : '');
      setError(cause instanceof Error ? cause.message : 'Could not complete the request.');
    } finally {
      setBusy(false);
    }
  }

  function updatePhoto(update: (photo: Photo) => Photo) {
    if (busy || !canEdit) return;
    setDirty(true);
    setPhotos(current => current.map((photo, index) => index === activeIndex ? update(photo) : photo));
  }

  function markReviewed() {
    updatePhoto(photo => ({ ...photo, reviewed: true }));
    const nextIndex = photos.findIndex((photo, index) => index > activeIndex && !photo.reviewed);
    const firstPending = photos.findIndex((photo, index) => index !== activeIndex && !photo.reviewed);
    if (nextIndex !== -1) setActiveIndex(nextIndex);
    else if (firstPending !== -1) setActiveIndex(firstPending);
  }

  function confirmMarkedPhotos() {
    if (busy || !canEdit || !pendingBoxes) return;
    setDirty(true);
    setPhotos(current => current.map(photo => photo.boxes.length ? { ...photo, reviewed: true } : photo));
    const next = photos.findIndex(photo => !photo.reviewed && !photo.boxes.length);
    if (next !== -1) setActiveIndex(next);
  }

  return (
    <div className="training-workflow">
      <section className="panel workflow-stage training-workspace">
        <h2>Training photos</h2>
        <div className="training-photo-nav">
          <label className="demo-field">
            Saved photo set
            <select value={revision ? datasetId : ''} disabled={busy || saved.length === 0}
              onChange={event => { if (event.target.value) void openDataset(event.target.value); }}>
              <option value="">Choose a saved photo set</option>
              {saved.map(dataset => <option key={dataset.id} value={dataset.id}>{dataset.part_name}</option>)}
            </select>
          </label>
          {canEdit && <button type="button" className="secondary" disabled={busy}
            onClick={newDataset}>New photo set</button>}
        </div>
        {listError && <p role="alert">{listError}</p>}
        {!canEdit && <p>You can view your company’s saved datasets.</p>}

        <div className="training-fields">
          <label className="demo-field">
            What part should the model find?
            <input value={partName} disabled={busy || !canEdit}
              onChange={event => { setPartName(event.target.value); setDirty(true); }}
              placeholder="For example, Bottle cap" maxLength={80} />
          </label>
          {canEdit && <label className="demo-field">
            Add photos (JPEG or PNG)
            <input type="file" accept="image/jpeg,image/png" multiple disabled={busy} onChange={event => {
              const files = Array.from(event.target.files ?? []);
              if (files.length) addPhotos(files);
              event.target.value = '';
            }} />
          </label>}
        </div>
        {canEdit && <p className="training-capture-tip">
          Select up to {MAX_PHOTOS} photos in batches. Include front, back, both sides, and top views
          the production-line camera can see. Add different batches and photos where the part is missing.
        </p>}
        {canEdit && <details className="check-options training-notes">
          <summary>Add an inspection note (optional)</summary>
          <label className="demo-field">
            What should pass inspection?
            <textarea value={inspectionRule} disabled={busy}
              onChange={event => { setInspectionRule(event.target.value); setDirty(true); }}
              placeholder="For example, pass if the bottle has a cap."
              rows={3} maxLength={400} aria-describedby="training-rule-help" />
          </label>
          <p id="training-rule-help">The note is saved with the dataset. The boxes show the model what to find.</p>
        </details>}

        {activePhoto && <section className="training-labeling" aria-labelledby="training-label-heading">
          <div className="training-review-heading">
            <h2 id="training-label-heading">Review photos</h2>
            <span role="status">{reviewedCount} of {photos.length} reviewed</span>
          </div>
          <progress aria-label="Photos reviewed" max={photos.length} value={reviewedCount} />
          {canEdit && <p>{part
            ? `Draw a box around each visible ${part}. Confirm the boxes together, or mark a photo as having no part.`
            : 'Enter a part name before drawing boxes.'}</p>}

          <div className="training-label-layout">
            <div className="training-gallery" role="group" aria-label="Training photos">
              {photos.map((photo, index) => (
                <PhotoTile key={photo.id} photo={photo} index={index} selected={index === activeIndex}
                  onSelect={() => setActiveIndex(index)} />
              ))}
            </div>
            <div className="training-preview">
              <div className="training-review-heading training-preview-heading">
                <h3 title={activePhoto.filename}>{activePhoto.filename}</h3>
                <span>Photo {activeIndex + 1} of {photos.length}</span>
              </div>
              <PhotoLabeler key={activePhoto.id} photo={activePhoto} editable={canEdit && !busy && !!part}
                onAddBox={box => updatePhoto(photo => ({
                  ...photo, boxes: [...photo.boxes, box], reviewed: false,
                }))} />
              <p role="status">{activePhoto.boxes.length} boxes in this photo.</p>
              {canEdit && <div className="label-actions">
                <button type="button" disabled={busy || !part || activePhoto.reviewed} onClick={markReviewed}>
                  {activePhoto.reviewed ? 'Photo reviewed' : activePhoto.boxes.length ? 'Confirm and go next' : 'Part is absent'}
                </button>
                <button type="button" className="secondary" disabled={busy || !activePhoto.boxes.length}
                  onClick={() => updatePhoto(photo => ({
                    ...photo, boxes: photo.boxes.slice(0, -1), reviewed: false,
                  }))}>Undo last box</button>
              </div>}
            </div>
          </div>
          {canEdit && pendingBoxes > 0 && (
            <button type="button" className="secondary training-confirm-batch" disabled={busy || !part}
              onClick={confirmMarkedPhotos}>
              Confirm boxes in {pendingBoxes} {pendingBoxes === 1 ? 'photo' : 'photos'}
            </button>
          )}
        </section>}

        {(revision > 0 || (canEdit && photos.length > 0)) && <TrainModel key={datasetId} orgId={orgId}
          datasetId={datasetId} revision={revision} canEdit={canEdit}
          busy={busy} dirty={dirty} canSave={!!part && photos.length > 0}
          blockedReason={trainingBlocked} onSubmit={submit} />}
        {message && <p role="status">{message}</p>}
        {error && <p role="alert">{error}</p>}
      </section>
    </div>
  );
}
