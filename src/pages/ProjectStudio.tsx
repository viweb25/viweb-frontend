import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { Topbar } from '../App';
import { useWorkspace } from '../context/WorkspaceContext';
import { looksBlurry, makeJpeg } from '../inspectionImage';
import {
  listCompletedJobs, openTrainingDataset, saveTrainingDataset, trainingPhotoDigest, trainingPhotoUrl, uploadTrainingPhoto,
  type Box, type ClassInfo, type TrainingJob, type TrainingPhoto,
} from '../services/api/trainingDatasets';
import { Icon } from '../ui/Icon';
import { ErrorBox, Loading, STEPS, colorFor, errorText, projectHref, useObjectUrl, type Step } from '../ui/common';
import { LabelStep } from './steps/LabelStep';
import { TestStep } from './steps/TestStep';
import { TrainStep } from './steps/TrainStep';
import { UploadStep } from './steps/UploadStep';
import { UseStep } from './steps/UseStep';

export type Photo = TrainingPhoto & { file?: File; savedUrl?: string; blurry?: boolean };
export const MAX_PHOTOS = 200;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

export type AddResult = { added: number; duplicates: string[]; rejected: string[]; blurry: string[]; overLimit: number };

export function useProject(orgId: string, datasetId: string, canEdit: boolean) {
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [loadError, setLoadError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [name, setNameState] = useState('');
  const [note, setNoteState] = useState('');
  const [classes, setClassesState] = useState<string[]>([]);
  const [classInfo, setClassInfoState] = useState<Record<string, ClassInfo>>({});
  const [photos, setPhotosState] = useState<Photo[]>([]);
  const [revision, setRevision] = useState(0);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState('');
  const [saveError, setSaveError] = useState('');
  const edits = useRef(0);
  const latest = useRef({ name, note, classes, classInfo, photos, revision });
  latest.current = { name, note, classes, classInfo, photos, revision };
  const inFlight = useRef<Promise<number> | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    setStatus('loading');
    openTrainingDataset(orgId, datasetId, controller.signal).then(dataset => {
      setNameState(dataset.part_name);
      setNoteState(dataset.inspection_note);
      setRevision(dataset.revision);
      const known = dataset.classes ?? [];
      const used = dataset.photos.flatMap(photo => photo.boxes.map(box => box.label || dataset.part_name));
      setClassesState([...new Set([...known, ...used])]);
      setClassInfoState(dataset.class_info ?? {});
      setPhotosState(dataset.photos.map(photo => ({
        ...photo,
        boxes: photo.boxes.map(box => ({ ...box, label: box.label || dataset.part_name })),
        savedUrl: trainingPhotoUrl(orgId, datasetId, photo.id),
      })));
      setDirty(false);
      setStatus('ready');
    }).catch(cause => {
      if (controller.signal.aborted) return;
      setLoadError(errorText(cause, 'Could not open this project.'));
      setStatus('error');
    });
    return () => controller.abort();
  }, [orgId, datasetId, attempt]);

  const touch = useCallback(() => {
    edits.current += 1;
    setDirty(true);
    setSaveError('');
  }, []);

  const setPhotos = useCallback((update: (photos: Photo[]) => Photo[]) => {
    setPhotosState(update);
    touch();
  }, [touch]);

  const updatePhoto = useCallback((id: string, update: (photo: Photo) => Photo) => {
    setPhotos(current => current.map(photo => photo.id === id ? update(photo) : photo));
  }, [setPhotos]);

  const setName = useCallback((value: string) => { setNameState(value); touch(); }, [touch]);
  const setNote = useCallback((value: string) => { setNoteState(value); touch(); }, [touch]);

  const addClass = useCallback((label: string) => {
    const value = label.trim().slice(0, 80);
    const current = latest.current.classes;
    if (!value || current.length >= 200 || current.some(item => item.toLowerCase() === value.toLowerCase())) return false;
    latest.current.classes = [...current, value];
    setClassesState(previous => [...previous, value]);
    touch();
    return true;
  }, [touch]);

  const setClassInfo = useCallback((label: string, info: ClassInfo) => {
    setClassInfoState(current => ({ ...current, [label]: info }));
    touch();
  }, [touch]);

  const renameClass = useCallback((from: string, to: string) => {
    const value = to.trim().slice(0, 80);
    if (!value || value === from) return;
    if (latest.current.classes.some(item => item !== from && item.toLowerCase() === value.toLowerCase())) return;
    setClassesState(current => current.map(item => item === from ? value : item));
    setClassInfoState(current => {
      const { [from]: info, ...rest } = current;
      return info ? { ...rest, [value]: info } : rest;
    });
    setPhotos(current => current.map(photo => ({
      ...photo, boxes: photo.boxes.map(box => box.label === from ? { ...box, label: value } : box),
    })));
  }, [setPhotos]);

  const removeClass = useCallback((label: string) => {
    setClassesState(current => current.filter(item => item !== label));
    setClassInfoState(current => {
      const { [label]: _removed, ...rest } = current;
      return rest;
    });
    setPhotos(current => current.map(photo => {
      const boxes = photo.boxes.filter(box => box.label !== label);
      return boxes.length === photo.boxes.length ? photo : { ...photo, boxes, reviewed: photo.reviewed && boxes.length > 0 };
    }));
  }, [setPhotos]);

  const addFiles = useCallback(async (files: File[]): Promise<AddResult> => {
    const result: AddResult = { added: 0, duplicates: [], rejected: [], blurry: [], overLimit: 0 };
    const room = MAX_PHOTOS - latest.current.photos.length;
    const accepted: Photo[] = [];
    const known = new Set(latest.current.photos.map(photo => photo.digest));
    const images = files.filter(file => file.type.startsWith('image/') || /\.(jpe?g|png|webp|bmp|gif|avif)$/i.test(file.name));
    result.rejected.push(...files.filter(file => !images.includes(file)).map(file => file.name));
    for (const file of images) {
      if (accepted.length >= room) {
        result.overLimit += 1;
        continue;
      }
      setSaveMessage(`Preparing ${file.name}…`);
      try {
        const image = await createImageBitmap(file);
        try {
          const upload = new File([await makeJpeg(image, image.width, image.height)], file.name.replace(/\.[^.]+$/, '') + '.jpg', { type: 'image/jpeg' });
          if (upload.size > MAX_IMAGE_BYTES) throw new Error('too large');
          const digest = await trainingPhotoDigest(upload);
          if (known.has(digest)) {
            result.duplicates.push(file.name);
            continue;
          }
          known.add(digest);
          const blurry = looksBlurry(image);
          if (blurry) result.blurry.push(file.name);
          accepted.push({
            id: crypto.randomUUID(), filename: file.name.slice(0, 255), media_type: 'image/jpeg',
            digest, file: upload, boxes: [], reviewed: false, blurry,
          });
        } finally {
          image.close();
        }
      } catch {
        result.rejected.push(file.name);
      }
    }
    setSaveMessage('');
    if (accepted.length) setPhotos(current => [...current, ...accepted]);
    result.added = accepted.length;
    return result;
  }, [setPhotos]);

  const labels = useMemo(() => {
    const used = photos.flatMap(photo => photo.boxes.map(box => box.label || name));
    return [...new Set([...classes, ...used])];
  }, [classes, photos, name]);

  const runSave = useCallback(async () => {
    const version = edits.current;
    const snapshot = latest.current;
    const uploads = snapshot.photos.filter(photo => photo.file);
    const digests = new Map<string, string>();
    for (let offset = 0; offset < uploads.length; offset += 4) {
      const batch = uploads.slice(offset, offset + 4);
      setSaveMessage(`Uploading photos ${offset + 1}–${offset + batch.length} of ${uploads.length}…`);
      await Promise.all(batch.map(async photo => {
        digests.set(photo.id, await uploadTrainingPhoto(orgId, datasetId, photo.id, photo.file!));
      }));
    }
    setSaveMessage('Saving…');
    const partName = snapshot.name.trim() || 'Untitled project';
    const used = snapshot.photos.flatMap(photo => photo.boxes.map(box => box.label || partName));
    const allClasses = [...new Set([...snapshot.classes, ...used])];
    const { revision: next } = await saveTrainingDataset(orgId, {
      id: datasetId,
      revision: snapshot.revision,
      part_name: partName,
      inspection_note: snapshot.note.slice(0, 400),
      classes: allClasses,
      class_info: Object.fromEntries(Object.entries(snapshot.classInfo).filter(([label]) => allClasses.includes(label))),
      photos: snapshot.photos.map(({ file: _file, savedUrl: _url, blurry: _blurry, ...record }) => ({
        ...record, digest: digests.get(record.id) ?? record.digest,
      })),
    });
    latest.current.revision = next;
    setRevision(next);
    setPhotosState(current => current.map(photo => digests.has(photo.id) ? {
      ...photo, file: undefined, digest: digests.get(photo.id)!, savedUrl: trainingPhotoUrl(orgId, datasetId, photo.id),
    } : photo));
    if (edits.current === version) setDirty(false);
    return next;
  }, [orgId, datasetId]);

  const save = useCallback(async (): Promise<number> => {
    if (!canEdit) return latest.current.revision;
    if (inFlight.current) {
      await inFlight.current.catch(() => undefined);
    }
    const run = runSave();
    inFlight.current = run;
    setSaving(true);
    setSaveError('');
    try {
      return await run;
    } catch (cause) {
      setSaveError(errorText(cause, 'Could not save your changes.'));
      throw cause;
    } finally {
      inFlight.current = null;
      setSaving(false);
      setSaveMessage('');
    }
  }, [canEdit, runSave]);

  // Autosave shortly after edits stop.
  useEffect(() => {
    if (!dirty || !canEdit || saving || saveError || status !== 'ready') return;
    const timer = setTimeout(() => { void save().catch(() => undefined); }, 1500);
    return () => clearTimeout(timer);
  }, [dirty, canEdit, saving, saveError, status, save, photos, classes, classInfo, name, note]);

  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  const reviewed = photos.filter(photo => photo.reviewed).length;
  const labelCounts = useMemo(() => Object.fromEntries(labels.map(label => [
    label, photos.filter(photo => photo.boxes.some(box => (box.label || name) === label)).length,
  ])), [labels, photos, name]);

  const blockedReason = photos.length < 4 ? `Add at least 4 photos (you have ${photos.length}).`
    : reviewed < photos.length ? `Label the remaining ${photos.length - reviewed} ${photos.length - reviewed === 1 ? 'photo' : 'photos'}.`
      : !photos.some(photo => photo.boxes.length) ? 'Draw boxes around the objects to find.'
        : labels.filter(label => labelCounts[label] > 0).length === 0 ? 'Draw at least one box.'
          : labels.some(label => labelCounts[label] < 2)
            ? `Each class needs boxes in at least 2 photos. Check: ${labels.filter(label => labelCounts[label] < 2).join(', ')}.`
            : '';

  return {
    status, loadError, reload: () => setAttempt(value => value + 1),
    name, setName, note, setNote, classes, labels, addClass, renameClass, removeClass, labelCounts,
    classInfo, setClassInfo, kindOf: (label: string) => classInfo[label]?.kind ?? 'object',
    passFail: labels.some(label => classInfo[label]?.kind === 'good' || classInfo[label]?.kind === 'defect'),
    photos, setPhotos, updatePhoto, addFiles, reviewed, revision,
    dirty, saving, saveMessage, saveError, save, blockedReason, canEdit,
  };
}

export type Project = ReturnType<typeof useProject>;

export function PhotoImage({ photo, className, alt = '' }: { photo: Photo; className?: string; alt?: string }) {
  const local = useObjectUrl(photo.file);
  const src = photo.file ? local : photo.savedUrl;
  return src ? <img className={className} src={src} alt={alt} loading="lazy" draggable={false} /> : null;
}

export function BoxOverlay({ boxes, labels }: { boxes: Box[]; labels: string[] }) {
  return <div className="boxes-overlay" aria-hidden="true">
    {boxes.map((box, index) => <span key={index} style={{
      left: `${Math.min(box.start.x, box.end.x) * 100}%`, top: `${Math.min(box.start.y, box.end.y) * 100}%`,
      width: `${Math.abs(box.start.x - box.end.x) * 100}%`, height: `${Math.abs(box.start.y - box.end.y) * 100}%`,
      borderColor: colorFor(labels, box.label ?? ''),
    }} />)}
  </div>;
}

const STEP_LABELS: Record<Step, string> = { upload: 'Upload', label: 'Label', train: 'Train', test: 'Test', use: 'Use' };

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
    upload: project.photos.length >= 4,
    label: project.photos.length > 0 && !project.blockedReason,
    train: !!models?.length,
    test: false,
    use: false,
  };

  const saveState = project.saveError
    ? <span className="save-state" role="alert"><Icon name="alert" /> Not saved
      <button type="button" className="btn link small" onClick={() => void project.save().catch(() => undefined)}>Retry</button></span>
    : project.saving ? <span className="save-state" role="status"><span className="spinner" style={{ width: 14, height: 14 }} />{project.saveMessage || 'Saving…'}</span>
      : project.saveMessage ? <span className="save-state" role="status"><span className="spinner" style={{ width: 14, height: 14 }} />{project.saveMessage}</span>
        : project.dirty ? <span className="save-state">Unsaved changes</span>
          : project.status === 'ready' && project.canEdit ? <span className="save-state"><Icon name="check" /> Saved</span> : null;

  return <>
    <Topbar right={saveState} compact>
      <div className="crumb">
        <a href="#/"><Icon name="back" /><span className="lbl-hide">Projects</span></a>
        <span aria-hidden="true">/</span>
        <strong title={project.name}>{project.name || '…'}</strong>
      </div>
      <ol className="stepper" aria-label="Project steps">
        {STEPS.map((item, index) => {
          const current = item === step;
          const state = current ? 'current' : done[item] ? 'done' : '';
          return <li key={item} className={state}>
            <a href={projectHref(orgId, datasetId, item)} aria-current={current ? 'step' : undefined}>
              <span className="n">{done[item] && !current ? <Icon name="check" /> : index + 1}</span>
              <span className="lbl">{STEP_LABELS[item]}</span>
            </a>
          </li>;
        })}
      </ol>
    </Topbar>
    {project.status === 'loading' && <main className="page"><Loading label="Opening project…" /></main>}
    {project.status === 'error' && <main className="page narrow"><ErrorBox message={project.loadError} onRetry={project.reload} /></main>}
    {project.status === 'ready' && <>
      {step === 'upload' && <UploadStep project={project} orgId={orgId} datasetId={datasetId} />}
      {step === 'label' && <LabelStep project={project} orgId={orgId} datasetId={datasetId} models={models ?? []} />}
      {step === 'train' && <TrainStep project={project} orgId={orgId} datasetId={datasetId}
        onModelsChanged={() => setModelsVersion(value => value + 1)} />}
      {step === 'test' && <TestStep project={project} orgId={orgId} datasetId={datasetId} models={models} />}
      {step === 'use' && <UseStep project={project} orgId={orgId} datasetId={datasetId} models={models} />}
    </>}
  </>;
}
