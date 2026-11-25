import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';

import { makeJpeg } from '../../inspectionImage';
import { previewTrainedModel, type Box, type ClassKind, type Point, type TrainingJob } from '../../services/api/trainingDatasets';
import { Icon } from '../../ui/Icon';
import { KIND_LABEL, Modal, colorFor, errorText, projectHref } from '../../ui/common';
import { PhotoImage, type Photo, type Project } from '../ProjectStudio';

type Filter = 'all' | 'todo' | 'done';
type Stage = 'ask' | 'draw' | 'more' | 'done';

function clamp(value: number) {
  return Math.min(1, Math.max(0, value));
}

function summary(boxes: Box[]) {
  if (!boxes.length) return 'Nothing to label';
  const counts = new Map<string, number>();
  for (const box of boxes) counts.set(box.label ?? '', (counts.get(box.label ?? '') ?? 0) + 1);
  return [...counts].map(([label, count]) => `${count} × ${label}`).join(', ');
}

export function KindBadge({ kind }: { kind: ClassKind }) {
  if (kind === 'object') return null;
  return <span className={`kind ${kind}`}><Icon name={kind === 'good' ? 'check' : 'alert'} />{KIND_LABEL[kind]}</span>;
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
  const [zoom, setZoom] = useState(100);
  const [editingClasses, setEditingClasses] = useState(false);
  const [message, setMessage] = useState('');
  const [suggesting, setSuggesting] = useState(false);
  const index = Math.max(0, photos.findIndex(photo => photo.id === activeId));
  const photo: Photo | undefined = photos[index];
  const filtered = useMemo(() => photos.filter(item =>
    filter === 'all' || (filter === 'done' ? item.reviewed : !item.reviewed)), [photos, filter]);
  const allDone = photos.length > 0 && photos.every(item => item.reviewed);

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

  function finishPhoto() {
    if (!photo) return;
    project.updatePhoto(photo.id, current => ({ ...current, reviewed: true }));
    nextTodo();
  }

  function nothingHere() {
    if (!photo) return;
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

  // Keyboard shortcuts for experienced users.
  const handlers = useRef({ go, finishPhoto, nothingHere, undo, removeBox, chooseClass, selectedBox, labels, canEdit, setZoom, stage });
  handlers.current = { go, finishPhoto, nothingHere, undo, removeBox, chooseClass, selectedBox, labels, canEdit, setZoom, stage };
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const target = event.target as HTMLElement;
      if (target.closest('input, textarea, select, [contenteditable=true], [role=dialog]')) return;
      const h = handlers.current;
      if (event.key === 'ArrowRight') { event.preventDefault(); h.go(1); return; }
      if (event.key === 'ArrowLeft') { event.preventDefault(); h.go(-1); return; }
      if (event.key === '+' || event.key === '=') { h.setZoom(value => Math.min(300, value + 25)); return; }
      if (event.key === '-') { h.setZoom(value => Math.max(100, value - 25)); return; }
      if (!h.canEdit) return;
      if (/^[1-9]$/.test(event.key) && !event.ctrlKey && !event.metaKey) {
        const label = h.labels[Number(event.key) - 1];
        if (label) h.chooseClass(label);
        return;
      }
      if (event.key === 'Enter' && !target.closest('button, a')) { event.preventDefault(); h.finishPhoto(); return; }
      if (event.key.toLowerCase() === 'e' && !event.ctrlKey && !event.metaKey) { h.nothingHere(); return; }
      if (event.key.toLowerCase() === 'z' && !event.shiftKey) { event.preventDefault(); h.undo(); return; }
      if ((event.key === 'Delete' || event.key === 'Backspace') && h.selectedBox !== null) {
        event.preventDefault();
        h.removeBox(h.selectedBox);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  async function suggest() {
    const latestModel = models[0];
    if (!photo || !latestModel || suggesting) return;
    setSuggesting(true);
    setMessage('');
    try {
      let image: Blob | undefined = photo.file;
      if (!image && photo.savedUrl) {
        const response = await fetch(photo.savedUrl);
        if (!response.ok) throw new Error('Could not open the saved photo.');
        image = await response.blob();
      }
      if (!image) throw new Error('Could not open this photo.');
      if (image.type !== 'image/jpeg') {
        const bitmap = await createImageBitmap(image);
        try { image = await makeJpeg(bitmap, bitmap.width, bitmap.height); } finally { bitmap.close(); }
      }
      const result = await previewTrainedModel(orgId, datasetId, latestModel.id, image, .4, '', false);
      const boxes = result.detections.filter(box => labels.includes(box.label) && box.x2 > box.x1 && box.y2 > box.y1)
        .slice(0, 300).map(box => ({ label: box.label, start: { x: box.x1, y: box.y1 }, end: { x: box.x2, y: box.y2 } }));
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
        <span className="swatch" style={{ background: colorFor(labels, label), width: 18, height: 18 }} />
        <span className="spacer">
          <strong>{prefix}{label}</strong>
          {info?.hint && <small>{info.hint}</small>}
        </span>
        <KindBadge kind={project.kindOf(label)} />
        {position < 9 && <kbd>{position + 1}</kbd>}
      </button>;
    })}
  </div>;

  return <main className="page wide" style={{ gap: '1.25rem' }}>
    <header className="page-head">
      <div>
        <span className="eyebrow">Step 2 of 5</span>
        <h1 style={{ marginTop: '.3rem' }}>Label your photos</h1>
        <p>Answer the question for each photo. The model learns from the boxes you draw.</p>
      </div>
      <a className={`btn${project.blockedReason ? ' ghost' : ''}`} href={projectHref(orgId, datasetId, 'train')}>
        {project.blockedReason ? 'Go to training' : 'Next: Train model'} <Icon name="arrow" />
      </a>
    </header>

    <HowItWorks project={project} />

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
          <span className="mini"><PhotoImage photo={item} /></span>
          <span style={{ minWidth: 0 }}>
            <span title={item.filename}>Photo {photos.indexOf(item) + 1}</span>
            <small>{item.reviewed ? <><Icon name="check" />{summary(item.boxes)}</> : <span className="todo-dot">To do</span>}</small>
          </span>
        </button>)}
        {!filtered.length && <p className="muted small" style={{ padding: '.5rem' }}>No photos here.</p>}
      </nav>

      {photo && <section className="stack" style={{ gap: '.9rem' }}>
        {canEdit && <section className={`card guide stage-${stage}`} aria-live="polite" aria-label="What to do with this photo">
          <div className="guide-head">
            <span className="guide-num">Photo {index + 1} of {photos.length}</span>
            {stage !== 'done' && <span className="guide-steps" aria-hidden="true">
              <i className={stage === 'ask' ? 'on' : 'past'} /><i className={stage === 'draw' ? 'on' : stage === 'more' ? 'past' : ''} /><i className={stage === 'more' ? 'on' : ''} />
            </span>}
          </div>

          {labels.length === 0 ? <>
            <h2>First, tell us what to look for</h2>
            <p>Add a label for each kind of thing you want the model to find. Then draw a box around each one in your photos.</p>
            <div className="row"><button type="button" className="btn" onClick={() => setEditingClasses(true)}><Icon name="plus" /> Add labels</button></div>
          </> : stage === 'ask' ? <>
            <h2>What do you see in this photo?</h2>
            <p>Look at the photo below and click what matches. If there are several, start with one; you can add the others next.</p>
            {classButtons()}
            <button type="button" className="guide-none" onClick={nothingHere}>
              <Icon name="close" /><span className="spacer"><strong>None of these: nothing to label</strong>
                <small>For example an empty belt or a different object. These photos teach the model what to ignore.</small></span><kbd>E</kbd>
            </button>
          </> : stage === 'draw' ? <>
            <h2>Draw a box around the <span className="hl" style={{ background: colorFor(labels, activeClass) }}>{activeClass}</span></h2>
            <ol className="how-draw">
              <li>Point the mouse at the <b>top-left corner</b> of the {activeClass}.</li>
              <li><b>Hold</b> the left mouse button and <b>drag</b> to the bottom-right corner.</li>
              <li><b>Let go.</b> Keep the box tight, but include the whole thing.</li>
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
              No, this photo is done. Next photo <Icon name="arrow" />
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
            <strong className="small" style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={photo.filename}>
              {photo.filename}
            </strong>
            <button type="button" className="icon-btn" aria-label="Zoom out" disabled={zoom <= 100} onClick={() => setZoom(value => Math.max(100, value - 25))}><Icon name="zoomOut" /></button>
            <output aria-live="polite">{zoom}%</output>
            <button type="button" className="icon-btn" aria-label="Zoom in" disabled={zoom >= 300} onClick={() => setZoom(value => Math.min(300, value + 25))}><Icon name="zoomIn" /></button>
            <button type="button" className="icon-btn" aria-label="Next photo" title="Next (→)" onClick={() => go(1)}><Icon name="arrow" /></button>
          </div>
          <Canvas key={photo.id} photo={photo} labels={labels} zoom={zoom} awaiting={canEdit && stage === 'draw'}
            canDraw={canEdit && !!activeClass && stage !== 'done'} activeClass={activeClass}
            selected={selectedBox} onSelect={setSelectedBox} onAdd={addBox} />
          {canEdit && <div className="row">
            <button type="button" className="btn ghost small" disabled={!photo.boxes.length} onClick={undo}><Icon name="undo" /> Undo last box</button>
            {models.length > 0 && stage !== 'done' && <button type="button" className="btn ghost small" disabled={suggesting} onClick={() => void suggest()}>
              <Icon name="sparkle" /> {suggesting ? 'Finding…' : 'Let the model suggest boxes'}
            </button>}
            <span className="spacer" />
            <button type="button" className="btn ghost small" onClick={() => {
              if (!window.confirm('Remove this photo from the project?')) return;
              const id = photo.id;
              go(1);
              project.setPhotos(current => current.filter(item => item.id !== id));
            }}><Icon name="trash" /> Remove photo</button>
          </div>}
        </section>
      </section>}

      <aside className="panel-stack">
        <section className="card side-card" aria-labelledby="progress-h">
          <div className="progress-line">
            <div id="progress-h"><span>{project.reviewed} of {photos.length} photos done</span><span>{percentDone}%</span></div>
            <div className="bar"><span style={{ width: `${percentDone}%` }} /></div>
          </div>
        </section>

        <section className="card side-card" aria-labelledby="classes-h">
          <h3 id="classes-h">What the model learns
            {canEdit && <button type="button" className="btn link small" onClick={() => setEditingClasses(true)}>Edit</button>}</h3>
          <ul className="class-summary">
            {labels.map(label => {
              const count = project.labelCounts[label] ?? 0;
              return <li key={label}>
                <span className="swatch" style={{ background: colorFor(labels, label) }} />
                <span className="spacer"><b>{label}</b> <KindBadge kind={project.kindOf(label)} />
                  {project.classInfo[label]?.hint && <small>{project.classInfo[label].hint}</small>}</span>
                <span className={`count-pill${count >= 10 ? ' ok' : ''}`} title="Photos with this class">{count}</span>
              </li>;
            })}
          </ul>
          {labels.length > 0 && <p className="small muted">Numbers show how many photos contain each class. Aim for <b>10 or more</b> each, and about the same for each.</p>}
          {!project.passFail && labels.length > 0 && canEdit && <div className="tip-box small">
            <Icon name="info" /><span>Want PASS / FAIL results? Click <b>Edit</b> and mark classes as <b>Good</b> or <b>Defect</b>.</span>
          </div>}
        </section>

        {photo && photo.boxes.length > 0 && <section className="card side-card" aria-labelledby="boxes-h">
          <h3 id="boxes-h">Boxes in this photo <span className="chip plain">{photo.boxes.length}</span></h3>
          <ul className="box-list">
            {photo.boxes.map((box, position) => <li key={position} className={selectedBox === position ? 'selected' : ''}>
              <span className="swatch" style={{ background: colorFor(labels, box.label ?? '') }} />
              <select aria-label={`Class of box ${position + 1}`} value={box.label ?? ''} disabled={!canEdit}
                onFocus={() => setSelectedBox(position)} onChange={event => { relabel(position, event.target.value); event.target.blur(); }}>
                {labels.map(label => <option key={label}>{label}</option>)}
              </select>
              {canEdit && <button type="button" className="icon-btn" aria-label={`Delete box ${position + 1}`}
                onClick={() => removeBox(position)}><Icon name="trash" /></button>}
            </li>)}
          </ul>
          <p className="small muted">Wrong box? Delete it here, or change its class.</p>
        </section>}

        <details className="card side-card">
          <summary style={{ cursor: 'pointer', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '.5rem' }}><Icon name="keyboard" /> Keyboard shortcuts</summary>
          <div className="shortcuts">
            <kbd>1–9</kbd><span>Choose a class</span>
            <kbd>↵</kbd><span>Photo done, next</span>
            <kbd>E</kbd><span>Nothing to label</span>
            <kbd>Z</kbd><span>Undo last box</span>
            <kbd>Del</kbd><span>Delete selected box</span>
            <kbd>← →</kbd><span>Previous / next photo</span>
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

function HowItWorks({ project }: { project: Project }) {
  const [open, setOpen] = useState(() => {
    try { return localStorage.getItem('vision-studio.label-help') !== 'closed'; } catch { return true; }
  });
  function toggle(value: boolean) {
    setOpen(value);
    try { localStorage.setItem('vision-studio.label-help', value ? 'open' : 'closed'); } catch { /* optional */ }
  }
  if (!open) return <button type="button" className="btn link small" style={{ justifySelf: 'start' }} onClick={() => toggle(true)}>
    <Icon name="info" /> How labeling works
  </button>;
  const good = project.labels.filter(label => project.kindOf(label) === 'good');
  const bad = project.labels.filter(label => project.kindOf(label) === 'defect');
  return <section className="card explain">
    <div className="row"><h2 className="spacer">How labeling works</h2>
      <button type="button" className="icon-btn" aria-label="Hide help" onClick={() => toggle(false)}><Icon name="close" /></button></div>
    <div className="explain-grid">
      <div><span className="n">1</span><b>The model copies you.</b> It learns only from the boxes you draw. It does not know what “good” or “bad” means until you show it.</div>
      <div><span className="n">2</span><b>One box per thing.</b> Draw a box around each thing and pick what it is
        {good.length > 0 && bad.length > 0 ? <>: <b>{good.join(', ')}</b> for good ones, <b>{bad.join(', ')}</b> for bad ones.</> : '.'}</div>
      <div><span className="n">3</span><b>Empty photos matter.</b> If a photo has nothing to label, say so. That teaches the model what to ignore.</div>
      <div><span className="n">4</span><b>Show both sides.</b> Give it about the same number of examples of each class: 10 or more each is a good start.</div>
    </div>
  </section>;
}

type Row = { original?: string; name: string; kind: ClassKind; hint: string };

function ClassesModal({ project, onClose }: { project: Project; onClose: () => void }) {
  const [rows, setRows] = useState<Row[]>(() => project.labels.length
    ? project.labels.map(label => ({
      original: label, name: label, kind: project.kindOf(label), hint: project.classInfo[label]?.hint ?? '',
    }))
    : [{ name: '', kind: 'object', hint: '' }]);
  const [error, setError] = useState('');

  function update(position: number, change: Partial<Row>) {
    setRows(current => current.map((row, item) => item === position ? { ...row, ...change } : row));
  }

  function save() {
    const names = rows.map(row => row.name.trim());
    if (names.some(name => !name)) return setError('Give every class a name.');
    if (new Set(names.map(name => name.toLowerCase())).size !== names.length) return setError('Each class needs a different name.');
    for (const label of project.labels) {
      if (!rows.some(row => row.original === label)) project.removeClass(label);
    }
    for (const row of rows) {
      const name = row.name.trim();
      if (row.original && row.original !== name) project.renameClass(row.original, name);
      if (!row.original) project.addClass(name);
      project.setClassInfo(name, { kind: row.kind, hint: row.hint.trim().slice(0, 120) });
    }
    onClose();
  }

  return <Modal title="What should the model learn?" wide onClose={onClose}
    description="Each class is one kind of thing you will draw boxes around. Mark good and defective versions to get PASS / FAIL results."
    footer={<>
      <button type="button" className="btn ghost" onClick={onClose}>Cancel</button>
      <button type="button" className="btn" onClick={save}><Icon name="check" /> Save classes</button>
    </>}>
    <div className="example-box small">
      Choose <b>Object</b> for things you want to find. For a pass/fail check, use <b>Good</b> for acceptable items
      and <b>Defect</b> for problems you want the model to flag.
    </div>
    <div className="class-table">
      <div className="class-table-head"><span>Name</span><span>Type</span><span>How to recognise it (optional)</span><span /></div>
      {rows.map((row, position) => {
        const used = row.original ? project.labelCounts[row.original] ?? 0 : 0;
        return <div className="class-table-row" key={position}>
          <input className="input" aria-label="Class name" value={row.name} maxLength={80} placeholder="Label name"
            onChange={event => update(position, { name: event.target.value })} />
          <div className="seg kind-seg" role="group" aria-label="Class type">
            {(['good', 'defect', 'object'] as const).map(kind => <button key={kind} type="button" aria-pressed={row.kind === kind}
              onClick={() => update(position, { kind })}>{KIND_LABEL[kind]}</button>)}
          </div>
          <input className="input" aria-label="Hint" value={row.hint} maxLength={120} placeholder="What to look for"
            onChange={event => update(position, { hint: event.target.value })} />
          <button type="button" className="icon-btn" aria-label={`Remove ${row.name || 'class'}`}
            title={used ? `Used in ${used} photos: removing it deletes those boxes` : 'Remove'}
            onClick={() => {
              if (used && !window.confirm(`“${row.original}” is used in ${used} photos. Remove it and delete those boxes?`)) return;
              setRows(current => current.filter((_, item) => item !== position));
            }}><Icon name="trash" /></button>
        </div>;
      })}
    </div>
    <div className="row">
      <button type="button" className="btn ghost small" onClick={() => setRows(current => [...current, { name: '', kind: 'object', hint: '' }])}>
        <Icon name="plus" /> Add a class</button>
      {rows.length === 0 && <button type="button" className="btn ghost small" onClick={() => setRows([
        { name: 'Good', kind: 'good', hint: 'Looks right' }, { name: 'Defect', kind: 'defect', hint: 'Something is wrong' },
      ])}>Use Good + Defect</button>}
    </div>
    <dl className="kind-help small">
      <div><dt><span className="kind good"><Icon name="check" />Good</span></dt><dd>Seeing it means PASS.</dd></div>
      <div><dt><span className="kind defect"><Icon name="alert" />Defect</span></dt><dd>Seeing even one means FAIL.</dd></div>
      <div><dt><span className="kind-plain">Object</span></dt><dd>Just found and counted.</dd></div>
    </dl>
    {error && <div className="alert" role="alert"><Icon name="alert" />{error}</div>}
  </Modal>;
}

function Canvas({ photo, labels, zoom, canDraw, awaiting, activeClass, selected, onSelect, onAdd }: {
  photo: Photo;
  labels: string[];
  zoom: number;
  canDraw: boolean;
  awaiting: boolean;
  activeClass: string;
  selected: number | null;
  onSelect: (index: number | null) => void;
  onAdd: (box: Box) => void;
}) {
  const [draft, setDraft] = useState<Box | null>(null);
  const area = useRef<HTMLDivElement>(null);

  function point(event: ReactPointerEvent): Point {
    const rect = area.current!.getBoundingClientRect();
    return { x: clamp((event.clientX - rect.left) / rect.width), y: clamp((event.clientY - rect.top) / rect.height) };
  }

  const shown = draft ? [...photo.boxes, draft] : photo.boxes;

  return <div className={`canvas-viewport${awaiting ? ' awaiting' : ''}`}>
    {awaiting && !draft && <div className="canvas-hint" aria-hidden="true">Drag on the photo to draw a box around the {activeClass}</div>}
    <div className={`canvas-zoom${zoom === 100 ? ' fit' : ''}`} style={zoom === 100 ? undefined : { width: `${zoom}%` }}>
      <div ref={area} className={`canvas-photo${canDraw ? '' : ' locked'}`}
        onPointerDown={event => {
          if (!canDraw || event.button !== 0 || !event.isPrimary) return;
          event.currentTarget.setPointerCapture(event.pointerId);
          const start = point(event);
          onSelect(null);
          setDraft({ start, end: start, label: activeClass });
        }}
        onPointerMove={event => {
          if (!draft || !event.currentTarget.hasPointerCapture(event.pointerId)) return;
          const end = point(event);
          setDraft(box => box && { ...box, end });
        }}
        onPointerUp={event => {
          if (!draft) return;
          const end = point(event);
          const rect = area.current!.getBoundingClientRect();
          if (Math.abs(draft.start.x - end.x) * rect.width >= 4 && Math.abs(draft.start.y - end.y) * rect.height >= 4) {
            onAdd({ ...draft, end });
          }
          setDraft(null);
        }}
        onLostPointerCapture={() => setDraft(null)}>
        <PhotoImage photo={photo} alt={photo.filename} />
        {shown.map((box, index) => {
          const isDraft = draft && index === shown.length - 1;
          const top = Math.min(box.start.y, box.end.y);
          return <div key={index} className={`lbox${isDraft ? ' draft' : ''}${selected === index ? ' selected' : ''}${top < .06 ? ' flip' : ''}`}
            style={{
              left: `${Math.min(box.start.x, box.end.x) * 100}%`, top: `${top * 100}%`,
              width: `${Math.abs(box.start.x - box.end.x) * 100}%`, height: `${Math.abs(box.start.y - box.end.y) * 100}%`,
              borderColor: colorFor(labels, box.label ?? ''),
            }}>
            {!isDraft && <button type="button" className="lbl" style={{ background: colorFor(labels, box.label ?? '') }}
              onPointerDown={event => event.stopPropagation()}
              onClick={() => onSelect(selected === index ? null : index)}
              aria-label={`Select box ${index + 1}: ${box.label}`}>{box.label}</button>}
          </div>;
        })}
      </div>
    </div>
  </div>;
}
