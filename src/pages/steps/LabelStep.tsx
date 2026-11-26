import { useEffect, useMemo, useRef, useState } from 'react';

import { makeJpeg } from '../../inspectionImage';
import { previewTrainedModel, type Box, type TrainingJob } from '../../services/api/trainingDatasets';
import { Icon, type IconName } from '../../ui/Icon';
import { BoxExamples, WaysToTeach } from '../../ui/Illustrations';
import { KindBadge } from '../../ui/KindBadge';
import { colorFor, errorText, projectHref } from '../../ui/common';
import { PhotoImage } from '../project/PhotoViews';
import { GOOD_PHOTOS_PER_CLASS, type Photo, type Project } from '../project/useProject';
import { ClassesModal } from './label/ClassesModal';
import { LabelCanvas } from './label/LabelCanvas';

type Filter = 'all' | 'todo' | 'done';
/** ask = "what do you see?", draw = drag a box, more = "anything else?", done = photo finished. */
type Stage = 'ask' | 'draw' | 'more' | 'done';

const SUGGEST_CONFIDENCE = .4;
const MAX_SUGGESTED_BOXES = 300;
const ZOOM_MIN = 100;
const ZOOM_MAX = 300;
const ZOOM_STEP = 25;

const GUIDE_STEPS: { stage: Stage; icon: IconName; label: string }[] = [
  { stage: 'ask', icon: 'eye', label: 'What is in it?' },
  { stage: 'draw', icon: 'box', label: 'Draw a box' },
  { stage: 'more', icon: 'plus', label: 'Anything else?' },
];

function summary(boxes: Box[]) {
  if (!boxes.length) return 'Nothing to label';
  const counts = new Map<string, number>();
  for (const box of boxes) counts.set(box.label ?? '', (counts.get(box.label ?? '') ?? 0) + 1);
  return [...counts].map(([label, count]) => `${count} × ${label}`).join(', ');
}

async function photoAsJpeg(photo: Photo): Promise<Blob> {
  let image: Blob | undefined = photo.file;
  if (!image && photo.savedUrl) {
    const response = await fetch(photo.savedUrl);
    if (!response.ok) throw new Error('Could not open the saved photo.');
    image = await response.blob();
  }
  if (!image) throw new Error('Could not open this photo.');
  if (image.type === 'image/jpeg') return image;
  const bitmap = await createImageBitmap(image);
  try { return await makeJpeg(bitmap, bitmap.width, bitmap.height); } finally { bitmap.close(); }
}

export function LabelStep({ project, orgId, datasetId, models }: {
  project: Project;
  orgId: string;
  datasetId: string;
  models: TrainingJob[];
}) {
  const { photos, labels, canEdit } = project;
  const [activeId, setActiveId] = useState(() => (photos.find(photo => !photo.reviewed) ?? photos[0])?.id ?? '');
  const [activeClass, setActiveClass] = useState(labels[0] ?? '');
  const [stage, setStage] = useState<Stage>('ask');
  const [lastAdded, setLastAdded] = useState('');
  const [selectedBox, setSelectedBox] = useState<number | null>(null);
  const [filter, setFilter] = useState<Filter>('all');
  const [zoom, setZoom] = useState(ZOOM_MIN);
  const [editingClasses, setEditingClasses] = useState(false);
  const [message, setMessage] = useState('');
  const [suggesting, setSuggesting] = useState(false);
  const index = Math.max(0, photos.findIndex(photo => photo.id === activeId));
  const photo: Photo | undefined = photos[index];
  const filtered = useMemo(() => photos.filter(item =>
    filter === 'all' || (filter === 'done' ? item.reviewed : !item.reviewed)), [photos, filter]);
  const positions = useMemo(() => new Map(photos.map((item, position) => [item.id, position])), [photos]);
  const allDone = photos.length > 0 && photos.every(item => item.reviewed);
  const newestModel = models[0]; // The API lists completed models newest first.

  useEffect(() => {
    if (!labels.includes(activeClass)) setActiveClass(labels[0] ?? '');
  }, [labels, activeClass]);

  // Each time a different photo is opened, start its guide from the right place.
  useEffect(() => {
    setSelectedBox(null);
    setMessage('');
    setStage(photo?.reviewed ? 'done' : photo?.boxes.length ? 'more' : 'ask');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId]);

  /* ---------- Actions ---------- */

  function go(offset: number) {
    if (!photos.length) return;
    setActiveId(photos[(index + offset + photos.length) % photos.length].id);
  }

  function nextTodo() {
    const target = photos.find((item, position) => position > index && !item.reviewed)
      ?? photos.find(item => item.id !== photo?.id && !item.reviewed);
    if (target) setActiveId(target.id);
    else {
      setStage('done');
      setMessage('');
    }
  }

  function chooseClass(label: string) {
    setActiveClass(label);
    setStage('draw');
    setMessage('');
    requestAnimationFrame(() => document.querySelector('.canvas-viewport')?.scrollIntoView({ behavior: 'smooth', block: 'center' }));
  }

  function addBox(box: Box) {
    if (!photo) return;
    project.updatePhoto(photo.id, current => ({ ...current, boxes: [...current.boxes, box] }));
    setSelectedBox(photo.boxes.length);
    setLastAdded(box.label ?? '');
    setStage('more');
  }

  function removeBox(position: number) {
    if (!photo) return;
    project.updatePhoto(photo.id, current => {
      const boxes = current.boxes.filter((_, item) => item !== position);
      return { ...current, boxes, reviewed: current.reviewed && boxes.length > 0 };
    });
    setSelectedBox(null);
    if (photo.boxes.length <= 1) setStage('ask');
  }

  function relabel(position: number, label: string) {
    if (!photo) return;
    project.updatePhoto(photo.id, current => ({
      ...current, boxes: current.boxes.map((box, item) => item === position ? { ...box, label } : box),
    }));
  }

  /** Mark the photo done. A photo with no boxes must be marked empty on purpose (nothingHere). */
  function finishPhoto() {
    if (!photo) return;
    if (!photo.boxes.length) {
      setMessage('This photo has no boxes yet. Draw a box, or choose “None of these” (key E) if there is nothing to label.');
      return;
    }
    project.updatePhoto(photo.id, current => ({ ...current, reviewed: true }));
    nextTodo();
  }

  /** Mark the photo as "nothing to label". Asks first if that would delete boxes. */
  function nothingHere() {
    if (!photo) return;
    const count = photo.boxes.length;
    if (count && !window.confirm(`Mark this photo as empty? This deletes its ${count} ${count === 1 ? 'box' : 'boxes'}.`)) return;
    project.updatePhoto(photo.id, current => ({ ...current, boxes: [], reviewed: true }));
    nextTodo();
  }

  function redo() {
    if (!photo) return;
    project.updatePhoto(photo.id, current => ({ ...current, boxes: [], reviewed: false }));
    setSelectedBox(null);
    setStage('ask');
  }

  function undo() {
    if (photo?.boxes.length) removeBox(photo.boxes.length - 1);
  }

  function removePhoto() {
    if (!photo || !window.confirm('Remove this photo from the project?')) return;
    const id = photo.id;
    go(1);
    project.setPhotos(current => current.filter(item => item.id !== id));
  }

  function changeZoom(delta: number) {
    setZoom(value => Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, value + delta)));
  }

  async function suggest() {
    if (!photo || !newestModel || suggesting) return;
    setSuggesting(true);
    setMessage('');
    try {
      const image = await photoAsJpeg(photo);
      const result = await previewTrainedModel(orgId, datasetId, newestModel.id, image, SUGGEST_CONFIDENCE, '', false);
      const boxes = result.detections
        .filter(box => labels.includes(box.label) && box.x2 > box.x1 && box.y2 > box.y1)
        .slice(0, MAX_SUGGESTED_BOXES)
        .map(box => ({ label: box.label, start: { x: box.x1, y: box.y1 }, end: { x: box.x2, y: box.y2 } }));
      if (!boxes.length) {
        setMessage('The model found nothing here. Answer the question above yourself.');
        return;
      }
      project.updatePhoto(photo.id, current => ({ ...current, boxes: [...current.boxes, ...boxes] }));
      setLastAdded(boxes.length === 1 ? boxes[0].label : `${boxes.length} suggested boxes`);
      setStage('more');
      setMessage('Suggested boxes added. Check each one: delete wrong boxes on the right, then finish the photo.');
    } catch (cause) {
      setMessage(errorText(cause, 'Could not suggest boxes.'));
    } finally {
      setSuggesting(false);
    }
  }

  /* ---------- Keyboard shortcuts ---------- */

  const handlers = useRef({ go, finishPhoto, nothingHere, undo, removeBox, chooseClass, changeZoom, selectedBox, labels, canEdit });
  handlers.current = { go, finishPhoto, nothingHere, undo, removeBox, chooseClass, changeZoom, selectedBox, labels, canEdit };
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const target = event.target as HTMLElement;
      if (target.closest('input, textarea, select, [contenteditable=true], [role=dialog]')) return;
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      const h = handlers.current;
      const key = event.key.toLowerCase();
      if (event.key === 'ArrowRight') { event.preventDefault(); h.go(1); return; }
      if (event.key === 'ArrowLeft') { event.preventDefault(); h.go(-1); return; }
      if (event.key === '+' || event.key === '=') { h.changeZoom(ZOOM_STEP); return; }
      if (event.key === '-') { h.changeZoom(-ZOOM_STEP); return; }
      if (!h.canEdit) return;
      if (/^[1-9]$/.test(event.key)) {
        const label = h.labels[Number(event.key) - 1];
        if (label) h.chooseClass(label);
        return;
      }
      if (event.key === 'Enter' && !target.closest('button, a')) { event.preventDefault(); h.finishPhoto(); return; }
      if (key === 'e') { h.nothingHere(); return; }
      if (key === 'z' && !event.shiftKey) { event.preventDefault(); h.undo(); return; }
      if ((event.key === 'Delete' || event.key === 'Backspace') && h.selectedBox !== null) {
        event.preventDefault();
        h.removeBox(h.selectedBox);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  /* ---------- Render ---------- */

  if (!photos.length) return <main className="page narrow">
    <div className="empty">
      <span className="bubble"><Icon name="image" /></span>
      <h2>No photos to label yet</h2>
      <p className="muted">Upload photos first, then come back here. We will walk you through each one.</p>
      <a className="btn" href={projectHref(orgId, datasetId, 'upload')}><Icon name="upload" /> Upload photos</a>
    </div>
  </main>;

  const percentDone = Math.round(100 * project.reviewed / photos.length);
  const classButtons = (prefix = '') => <div className="guide-choices">
    {labels.map((label, position) => {
      const info = project.classInfo[label];
      return <button key={label} type="button" className="guide-choice" onClick={() => chooseClass(label)}>
        <span className="swatch big" style={{ background: colorFor(labels, label) }} />
        <span className="spacer">
          <strong>{prefix}{label}</strong>
          {info?.hint && <small>{info.hint}</small>}
        </span>
        <KindBadge kind={project.kindOf(label)} />
        {position < 9 && <kbd title={`Press ${position + 1}`}>{position + 1}</kbd>}
      </button>;
    })}
  </div>;

  return <main className="page wide" style={{ gap: '1.25rem' }}>
    <header className="page-head">
      <div>
        <span className="eyebrow"><Icon name="box" /> Step 3 of 6</span>
        <h1 style={{ marginTop: '.3rem' }}>Mark the photos</h1>
        <p>One photo at a time. Box every thing you see.</p>
      </div>
      <a className={`btn${project.blockedReason ? ' ghost' : ''}`} href={projectHref(orgId, datasetId, 'train')}>
        {project.blockedReason ? 'Go to training' : 'Next: Train model'} <Icon name="arrow" />
      </a>
    </header>

    <LabelHelp />

    <div className="labeler">
      <nav className="filmstrip" aria-label="Photos">
        <div className="filter">
          <div className="seg" role="group" aria-label="Show photos" style={{ width: '100%' }}>
            {([['all', `All ${photos.length}`], ['todo', `To do ${photos.length - project.reviewed}`], ['done', `Done ${project.reviewed}`]] as const)
              .map(([value, text]) => <button key={value} type="button" style={{ flex: 1, padding: '.35rem .3rem', fontSize: '.78rem' }}
                aria-pressed={filter === value} onClick={() => setFilter(value)}>{text}</button>)}
          </div>
        </div>
        {filtered.map(item => <button key={item.id} type="button" className={`film${item.reviewed ? ' done' : ''}`}
          aria-current={item.id === photo?.id} onClick={() => setActiveId(item.id)}>
          <span className="mini"><PhotoImage photo={item} />
            {item.reviewed && <span className="mini-badge"><Icon name="check" /></span>}</span>
          <span style={{ minWidth: 0 }}>
            <span title={item.filename}>Photo {(positions.get(item.id) ?? 0) + 1}</span>
            <small>{item.reviewed ? <>{item.boxes.length ? <Icon name="box" /> : <Icon name="close" />}{summary(item.boxes)}</>
              : <span className="todo-dot">To do</span>}</small>
          </span>
        </button>)}
        {!filtered.length && <p className="muted small" style={{ padding: '.5rem' }}>No photos here.</p>}
      </nav>

      {photo && <section className="stack" style={{ gap: '.9rem' }}>
        {canEdit && <section className={`card guide stage-${stage}`} aria-live="polite" aria-label="What to do with this photo">
          <div className="guide-head">
            <span className="guide-num">Photo {index + 1} of {photos.length}</span>
            {stage !== 'done' && labels.length > 0 && <GuideSteps stage={stage} />}
          </div>

          {labels.length === 0 ? <>
            <h2><Icon name="target" /> First, say what to find</h2>
            <p>Name the things, and say if each one is good or bad.</p>
            <div className="row"><a className="btn" href={projectHref(orgId, datasetId, 'detect')}><Icon name="tag" /> What to find <Icon name="arrow" /></a></div>
          </> : stage === 'ask' ? <>
            <h2>What do you see in this photo?</h2>
            <p>Look at the photo below and click what matches. If there are several, start with one; you add the others next.</p>
            {classButtons()}
            <button type="button" className="guide-none" onClick={nothingHere}>
              <Icon name="close" /><span className="spacer"><strong>None of these: nothing to label</strong>
                <small>For example an empty belt or a different object. These photos teach the model what to ignore.</small></span><kbd>E</kbd>
            </button>
          </> : stage === 'draw' ? <>
            <h2>Draw a box around the <span className="hl" style={{ background: colorFor(labels, activeClass) }}>{activeClass}</span></h2>
            <ol className="how-draw visual">
              <li><span className="how-ico"><Icon name="target" /></span>Point at the <b>top-left corner</b> of the {activeClass}.</li>
              <li><span className="how-ico"><Icon name="arrow" /></span><b>Hold</b> the mouse button and <b>drag</b> to the bottom-right corner.</li>
              <li><span className="how-ico"><Icon name="check" /></span><b>Let go.</b> Keep the box tight, but include the whole thing.</li>
            </ol>
            <div className="row">
              <button type="button" className="btn ghost small" onClick={() => setStage(photo.boxes.length ? 'more' : 'ask')}><Icon name="back" /> Back</button>
              {labels.length > 1 && <span className="small muted">Wrong choice? Pick another: {labels.filter(label => label !== activeClass).map(label =>
                <button key={label} type="button" className="btn link small" onClick={() => setActiveClass(label)}>{label}</button>)}</span>}
            </div>
          </> : stage === 'more' ? <>
            <h2><Icon name="check" /> Box added{lastAdded ? `: ${lastAdded}` : ''}</h2>
            <p>Is there <b>another</b> thing to label in this photo? Every one should get its own box.</p>
            {classButtons('Yes, another ')}
            <button type="button" className="btn large block" onClick={finishPhoto}>
              No, this photo is done. Next photo <Icon name="arrow" /> <kbd className="on-dark">↵</kbd>
            </button>
          </> : <>
            <h2><Icon name="check" /> {allDone ? 'All photos are labeled!' : 'This photo is done'}</h2>
            <p>{allDone ? 'Great work. You can train your model now.' : <>Labeled as: <b>{summary(photo.boxes)}</b></>}</p>
            <div className="row">
              {allDone ? <a className="btn" href={projectHref(orgId, datasetId, 'train')}>Go to training <Icon name="arrow" /></a>
                : <button type="button" className="btn" onClick={nextTodo}>Next photo to label <Icon name="arrow" /></button>}
              <button type="button" className="btn ghost" onClick={() => setStage('more')}><Icon name="plus" /> Add another box</button>
              <button type="button" className="btn ghost" onClick={redo}><Icon name="undo" /> Clear and redo this photo</button>
            </div>
          </>}
          {message && <p className="small guide-msg" role="status"><Icon name="info" /> {message}</p>}
        </section>}

        <section className="card canvas-card" aria-label="Photo">
          <div className="canvas-tools">
            <button type="button" className="icon-btn" aria-label="Previous photo" title="Previous (←)" onClick={() => go(-1)}><Icon name="back" /></button>
            <strong className="small canvas-name" title={photo.filename}>
              <Icon name="image" /> {photo.filename}
            </strong>
            <button type="button" className="icon-btn" aria-label="Zoom out" title="Zoom out (−)" disabled={zoom <= ZOOM_MIN} onClick={() => changeZoom(-ZOOM_STEP)}><Icon name="zoomOut" /></button>
            <output aria-live="polite">{zoom}%</output>
            <button type="button" className="icon-btn" aria-label="Zoom in" title="Zoom in (+)" disabled={zoom >= ZOOM_MAX} onClick={() => changeZoom(ZOOM_STEP)}><Icon name="zoomIn" /></button>
            <button type="button" className="icon-btn" aria-label="Next photo" title="Next (→)" onClick={() => go(1)}><Icon name="arrow" /></button>
          </div>
          <LabelCanvas key={photo.id} photo={photo} labels={labels} zoom={zoom} awaiting={canEdit && stage === 'draw'}
            canDraw={canEdit && !!activeClass && stage !== 'done'} activeClass={activeClass}
            selected={selectedBox} onSelect={setSelectedBox} onAdd={addBox} />
          {canEdit && <div className="row">
            <button type="button" className="btn ghost small" disabled={!photo.boxes.length} onClick={undo}><Icon name="undo" /> Undo last box</button>
            {newestModel && stage !== 'done' && <button type="button" className="btn ghost small" disabled={suggesting} onClick={() => void suggest()}
              title="Your latest trained model draws boxes; you check them">
              <Icon name="sparkle" /> {suggesting ? 'Finding…' : 'Let the model suggest boxes'}
            </button>}
            <span className="spacer" />
            <button type="button" className="btn ghost small" onClick={removePhoto}><Icon name="trash" /> Remove photo</button>
          </div>}
        </section>
      </section>}

      <aside className="panel-stack">
        <section className="card side-card" aria-labelledby="progress-h">
          <div className="progress-line">
            <div id="progress-h"><span><Icon name="check" /> {project.reviewed} of {photos.length} photos done</span><span>{percentDone}%</span></div>
            <div className="bar"><span style={{ width: `${percentDone}%` }} /></div>
          </div>
        </section>

        <section className="card side-card" aria-labelledby="classes-h">
          <h3 id="classes-h"><span><Icon name="tag" /> What the model learns</span>
            {canEdit && <button type="button" className="btn link small" onClick={() => setEditingClasses(true)}>Edit</button>}</h3>
          <ul className="class-summary">
            {labels.map((label, position) => {
              const count = project.labelCounts[label] ?? 0;
              const fill = Math.min(100, Math.round(100 * count / GOOD_PHOTOS_PER_CLASS));
              return <li key={label}>
                <span className="swatch" style={{ background: colorFor(labels, label) }} />
                <span className="spacer">
                  <b>{label}</b> <KindBadge kind={project.kindOf(label)} />
                  {project.classInfo[label]?.hint && <small>{project.classInfo[label].hint}</small>}
                  <span className="mini-bar" title={`${count} of ${GOOD_PHOTOS_PER_CLASS} recommended photos`}>
                    <span style={{ width: `${fill}%`, background: colorFor(labels, label) }} />
                  </span>
                </span>
                {position < 9 && <kbd>{position + 1}</kbd>}
                <span className={`count-pill${count >= GOOD_PHOTOS_PER_CLASS ? ' ok' : ''}`} title="Photos with this class">{count}</span>
              </li>;
            })}
          </ul>
          {labels.length > 0 && <p className="small muted">Bars fill at <b>{GOOD_PHOTOS_PER_CLASS} photos</b> per class. Aim for about the same number for each.</p>}
          {!project.passFail && labels.length > 0 && canEdit && <div className="tip-box small">
            <Icon name="info" /><span>Want PASS / FAIL results? Click <b>Edit</b> and mark classes as <b>Good</b> or <b>Defect</b>.</span>
          </div>}
        </section>

        {photo && photo.boxes.length > 0 && <section className="card side-card" aria-labelledby="boxes-h">
          <h3 id="boxes-h"><span><Icon name="box" /> Boxes in this photo</span> <span className="chip plain">{photo.boxes.length}</span></h3>
          <ul className="box-list">
            {photo.boxes.map((box, position) => <li key={position} className={selectedBox === position ? 'selected' : ''}>
              <span className="box-n" style={{ background: colorFor(labels, box.label ?? '') }}>{position + 1}</span>
              <select aria-label={`Class of box ${position + 1}`} value={box.label ?? ''} disabled={!canEdit}
                onFocus={() => setSelectedBox(position)} onChange={event => { relabel(position, event.target.value); event.target.blur(); }}>
                {labels.map(label => <option key={label}>{label}</option>)}
              </select>
              {canEdit && <button type="button" className="icon-btn" aria-label={`Delete box ${position + 1}`}
                onClick={() => removeBox(position)}><Icon name="trash" /></button>}
            </li>)}
          </ul>
          <p className="small muted">Wrong box? Delete it here, or change its class. Numbers match the boxes on the photo.</p>
        </section>}

        <details className="card side-card">
          <summary className="side-summary"><Icon name="keyboard" /> Keyboard shortcuts</summary>
          <div className="shortcuts">
            <kbd>1–9</kbd><span>Choose a class</span>
            <kbd>↵</kbd><span>Photo done, next</span>
            <kbd>E</kbd><span>Nothing to label</span>
            <kbd>Z</kbd><span>Undo last box</span>
            <kbd>Del</kbd><span>Delete selected box</span>
            <kbd>← →</kbd><span>Previous / next photo</span>
            <kbd>+ −</kbd><span>Zoom in / out</span>
          </div>
        </details>
      </aside>
    </div>

    {project.blockedReason ? <div className="notice"><Icon name="info" />Before you can train: {project.blockedReason}</div>
      : <div className="success"><Icon name="check" /><div className="spacer">Your photos are ready for training.</div>
        <a className="btn small" href={projectHref(orgId, datasetId, 'train')}>Train model <Icon name="arrow" /></a></div>}

    {editingClasses && <ClassesModal project={project} onClose={() => setEditingClasses(false)} />}
  </main>;
}

/** Named progress through one photo: what is in it → draw → anything else. */
function GuideSteps({ stage }: { stage: Stage }) {
  const current = GUIDE_STEPS.findIndex(step => step.stage === stage);
  return <ol className="guide-steps" aria-label="Steps for this photo">
    {GUIDE_STEPS.map((step, position) => {
      const state = position === current ? 'on' : position < current ? 'past' : '';
      return <li key={step.stage} className={state} aria-current={state === 'on' ? 'step' : undefined}>
        <span className="gs-dot">{state === 'past' ? <Icon name="check" /> : <Icon name={step.icon} />}</span>
        <span className="gs-label">{step.label}</span>
      </li>;
    })}
  </ol>;
}

type HelpTab = 'rules' | 'boxes' | 'ways';
const HELP_KEY = 'vision-studio.label-help';

/** Collapsible teaching panel with three tabs. Open/closed is remembered per browser. */
function LabelHelp() {
  const [open, setOpen] = useState(() => {
    try { return localStorage.getItem(HELP_KEY) !== 'closed'; } catch { return true; }
  });
  const [tab, setTab] = useState<HelpTab>('rules');
  function toggle(value: boolean) {
    setOpen(value);
    try { localStorage.setItem(HELP_KEY, value ? 'open' : 'closed'); } catch { /* optional */ }
  }
  if (!open) return <button type="button" className="btn ghost small" style={{ justifySelf: 'start' }} onClick={() => toggle(true)}>
    <Icon name="help" /> How to teach the model
  </button>;
  return <section className="card explain">
    <div className="row">
      <h2 className="spacer"><Icon name="help" /> How to teach the model</h2>
      <div className="seg" role="tablist" aria-label="Help topics">
        {([['rules', 'The 4 rules'], ['boxes', 'Good vs bad boxes'], ['ways', 'Ways to teach']] as const).map(([value, text]) =>
          <button key={value} type="button" role="tab" aria-selected={tab === value} aria-pressed={tab === value}
            onClick={() => setTab(value)}>{text}</button>)}
      </div>
      <button type="button" className="icon-btn" aria-label="Hide help" onClick={() => toggle(false)}><Icon name="close" /></button>
    </div>
    {tab === 'rules' && <div className="explain-grid">
      <div><span className="n">1</span><b>The model copies you.</b> It learns only from the boxes you draw. It does not know what “good” or “bad” means until you show it.</div>
      <div><span className="n">2</span><b>One box per thing.</b> Draw a box around each thing and pick what it is. Two caps means two boxes.</div>
      <div><span className="n">3</span><b>Empty photos matter.</b> If a photo has nothing to label, say so. That teaches the model what to ignore.</div>
      <div><span className="n">4</span><b>Show both sides.</b> About the same number of examples of each class: {GOOD_PHOTOS_PER_CLASS} or more each is a good start.</div>
    </div>}
    {tab === 'boxes' && <BoxExamples />}
    {tab === 'ways' && <WaysToTeach />}
  </section>;
}
