import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { looksBlurry, makeJpeg } from '../../inspectionImage';
import {
  openTrainingDataset, saveTrainingDataset, trainingPhotoDigest, trainingPhotoUrl, uploadTrainingPhoto,
  type ClassInfo, type ClassKind, type TrainingPhoto,
} from '../../services/api/trainingDatasets';
import { errorText } from '../../ui/common';

/** A photo in the editor. `file` is set until the photo has been uploaded. */
export type Photo = TrainingPhoto & { file?: File; savedUrl?: string; blurry?: boolean };

export type AddResult = { added: number; duplicates: string[]; rejected: string[]; blurry: string[]; overLimit: number };

/** One row of the class editor. `original` is the class name before this edit (absent for new classes). */
export type ClassEdit = { original?: string; name: string; kind: ClassKind; hint: string };

export const MAX_PHOTOS = 200;
export const MAX_CLASSES = 200;
export const MIN_PHOTOS_TO_TRAIN = 4;
export const MIN_PHOTOS_PER_CLASS = 2;
export const GOOD_PHOTOS_PER_CLASS = 10;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const UPLOAD_PARALLELISM = 4;
const AUTOSAVE_DELAY_MS = 1500;
const IMAGE_NAME = /\.(jpe?g|png|webp|bmp|gif|avif)$/i;

function sameName(a: string, b: string) {
  return a.toLowerCase() === b.toLowerCase();
}

function cleanName(value: string) {
  return value.trim().slice(0, 80);
}

/** Why training cannot start yet, or '' when the project is ready. */
export function trainingBlocker(photos: Photo[], labels: string[], labelCounts: Record<string, number>) {
  const reviewed = photos.filter(photo => photo.reviewed).length;
  const left = photos.length - reviewed;
  if (photos.length < MIN_PHOTOS_TO_TRAIN) return `Add at least ${MIN_PHOTOS_TO_TRAIN} photos (you have ${photos.length}).`;
  if (left > 0) return `Label the remaining ${left} ${left === 1 ? 'photo' : 'photos'}.`;
  if (!photos.some(photo => photo.boxes.length)) return 'Draw boxes around the objects to find.';
  const thin = labels.filter(label => (labelCounts[label] ?? 0) < MIN_PHOTOS_PER_CLASS);
  if (thin.length) return `Each class needs boxes in at least ${MIN_PHOTOS_PER_CLASS} photos. Check: ${thin.join(', ')}.`;
  return '';
}

/**
 * All editable state of one project (training dataset) plus autosave.
 * Every save sends the whole project with its revision; saves run one at a time.
 */
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
  const saveQueue = useRef<Promise<unknown>>(Promise.resolve());

  /* ---------- Load ---------- */

  useEffect(() => {
    const controller = new AbortController();
    setStatus('loading');
    openTrainingDataset(orgId, datasetId, controller.signal).then(dataset => {
      const fallback = dataset.part_name;
      const used = dataset.photos.flatMap(photo => photo.boxes.map(box => box.label || fallback));
      setNameState(dataset.part_name);
      setNoteState(dataset.inspection_note);
      setRevision(dataset.revision);
      setClassesState([...new Set([...(dataset.classes ?? []), ...used])]);
      setClassInfoState(dataset.class_info ?? {});
      setPhotosState(dataset.photos.map(photo => ({
        ...photo,
        boxes: photo.boxes.map(box => ({ ...box, label: box.label || fallback })),
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

  /* ---------- Edits ---------- */

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
    const value = cleanName(label);
    const current = latest.current.classes;
    if (!value || current.length >= MAX_CLASSES || current.some(item => sameName(item, value))) return false;
    latest.current.classes = [...current, value];
    setClassesState(previous => [...previous, value]);
    touch();
    return true;
  }, [touch]);

  /**
   * Replace the whole class list in one step: renames, removals, additions, kinds and hints.
   * Renames are applied simultaneously, so swapping two names works. Boxes of removed
   * classes are deleted; a photo that loses all its boxes goes back to "to do".
   * Returns an error message, or '' on success.
   */
  const applyClasses = useCallback((rows: ClassEdit[]) => {
    const names = rows.map(row => cleanName(row.name));
    if (names.some(value => !value)) return 'Give every class a name.';
    if (names.some((value, index) => names.findIndex(other => sameName(other, value)) !== index)) {
      return 'Each class needs a different name.';
    }
    if (names.length > MAX_CLASSES) return `A project can have up to ${MAX_CLASSES} classes.`;

    const renamed = new Map<string, string>();
    rows.forEach((row, index) => { if (row.original) renamed.set(row.original, names[index]); });
    const info = Object.fromEntries(rows.map((row, index) =>
      [names[index], { kind: row.kind, hint: row.hint.trim().slice(0, 120) }]));

    latest.current.classes = names;
    setClassesState(names);
    setClassInfoState(info);
    setPhotos(current => current.map(photo => {
      if (!photo.boxes.length) return photo;
      const boxes = photo.boxes
        .filter(box => renamed.has(box.label ?? ''))
        .map(box => ({ ...box, label: renamed.get(box.label ?? '')! }));
      const lostAll = photo.boxes.length > 0 && boxes.length === 0;
      return { ...photo, boxes, reviewed: photo.reviewed && !lostAll };
    }));
    return '';
  }, [setPhotos]);

  const addFiles = useCallback(async (files: File[]): Promise<AddResult> => {
    const result: AddResult = { added: 0, duplicates: [], rejected: [], blurry: [], overLimit: 0 };
    const room = MAX_PHOTOS - latest.current.photos.length;
    const accepted: Photo[] = [];
    const known = new Set(latest.current.photos.map(photo => photo.digest));
    const images = files.filter(file => file.type.startsWith('image/') || IMAGE_NAME.test(file.name));
    result.rejected.push(...files.filter(file => !images.includes(file)).map(file => file.name));
    for (const [position, file] of images.entries()) {
      if (accepted.length >= room) {
        result.overLimit += 1;
        continue;
      }
      setSaveMessage(`Preparing photo ${position + 1} of ${images.length}…`);
      try {
        const image = await createImageBitmap(file);
        try {
          const jpeg = await makeJpeg(image, image.width, image.height);
          const upload = new File([jpeg], file.name.replace(/\.[^.]+$/, '') + '.jpg', { type: 'image/jpeg' });
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

  /* ---------- Derived ---------- */

  const labels = useMemo(() => {
    const used = photos.flatMap(photo => photo.boxes.map(box => box.label || name));
    return [...new Set([...classes, ...used])];
  }, [classes, photos, name]);

  const labelCounts = useMemo(() => Object.fromEntries(labels.map(label => [
    label, photos.filter(photo => photo.boxes.some(box => (box.label || name) === label)).length,
  ])), [labels, photos, name]);

  const reviewed = photos.filter(photo => photo.reviewed).length;
  const blockedReason = trainingBlocker(photos, labels, labelCounts);
  const kindOf = useCallback((label: string): ClassKind => classInfo[label]?.kind ?? 'object', [classInfo]);
  const passFail = labels.some(label => kindOf(label) !== 'object');

  /* ---------- Save ---------- */

  const runSave = useCallback(async () => {
    const version = edits.current;
    const snapshot = latest.current;
    const uploads = snapshot.photos.filter(photo => photo.file);
    const digests = new Map<string, string>();
    for (let offset = 0; offset < uploads.length; offset += UPLOAD_PARALLELISM) {
      const batch = uploads.slice(offset, offset + UPLOAD_PARALLELISM);
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

  /** Save now. Calls are queued, so two saves never send the same revision. */
  const save = useCallback((): Promise<number> => {
    if (!canEdit) return Promise.resolve(latest.current.revision);
    const run = saveQueue.current.catch(() => undefined).then(async () => {
      setSaving(true);
      setSaveError('');
      try {
        return await runSave();
      } catch (cause) {
        setSaveError(errorText(cause, 'Could not save your changes.'));
        throw cause;
      } finally {
        setSaving(false);
        setSaveMessage('');
      }
    });
    saveQueue.current = run;
    return run;
  }, [canEdit, runSave]);

  // Autosave shortly after edits stop.
  useEffect(() => {
    if (!dirty || !canEdit || saving || saveError || status !== 'ready') return;
    const timer = setTimeout(() => { void save().catch(() => undefined); }, AUTOSAVE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [dirty, canEdit, saving, saveError, status, save, photos, classes, classInfo, name, note]);

  // Warn before leaving with unsaved edits.
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  return {
    status, loadError, reload: () => setAttempt(value => value + 1),
    name, setName, note, setNote,
    classes, labels, labelCounts, addClass, applyClasses, classInfo, kindOf, passFail,
    photos, setPhotos, updatePhoto, addFiles, reviewed, revision,
    dirty, saving, saveMessage, saveError, save, blockedReason, canEdit,
  };
}

export type Project = ReturnType<typeof useProject>;
