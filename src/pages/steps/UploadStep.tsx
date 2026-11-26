import { useRef, useState } from 'react';

import { Icon } from '../../ui/Icon';
import { PhotoMix } from '../../ui/Illustrations';
import { KindBadge } from '../../ui/KindBadge';
import { colorFor, projectHref } from '../../ui/common';
import { BoxOverlay, PhotoImage } from '../project/PhotoViews';
import { GOOD_PHOTOS_PER_CLASS, MAX_PHOTOS, MIN_PHOTOS_TO_TRAIN, type AddResult, type Project } from '../project/useProject';

function plural(count: number, one: string, many: string) {
  return `${count} ${count === 1 ? one : many}`;
}

function reportProblems(report: AddResult) {
  return [
    report.duplicates.length ? `Skipped ${plural(report.duplicates.length, 'duplicate photo', 'duplicate photos')}.` : '',
    report.rejected.length ? `Could not open: ${report.rejected.slice(0, 5).join(', ')}${report.rejected.length > 5 ? '…' : ''}.` : '',
    report.overLimit ? `${report.overLimit} not added: a project holds up to ${MAX_PHOTOS} photos.` : '',
    report.blurry.length ? `${plural(report.blurry.length, 'photo looks', 'photos look')} blurry. You can keep or remove ${report.blurry.length === 1 ? 'it' : 'them'}.` : '',
  ].filter(Boolean);
}

export function UploadStep({ project, orgId, datasetId }: { project: Project; orgId: string; datasetId: string }) {
  const [over, setOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const [report, setReport] = useState<AddResult | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const { photos, canEdit } = project;
  const full = photos.length >= MAX_PHOTOS;
  const blurry = photos.filter(photo => photo.blurry).length;
  const problems = report ? reportProblems(report) : [];
  const enough = photos.length >= MIN_PHOTOS_TO_TRAIN;

  async function add(files: File[]) {
    if (!files.length || busy || !canEdit || full) return;
    setBusy(true);
    setReport(null);
    try {
      setReport(await project.addFiles(files));
    } finally {
      setBusy(false);
    }
  }

  function browse() {
    if (!full && !busy) input.current?.click();
  }

  return <main className="page">
    <header className="page-head">
      <div>
        <span className="eyebrow"><Icon name="camera" /> Step 2 of 6</span>
        <h1 style={{ marginTop: '.3rem' }}>Add photos</h1>
        <p>Good boards and bad boards. Same camera, same light.</p>
      </div>
      {photos.length > 0 && <a className="btn" href={projectHref(orgId, datasetId, 'label')}>
        Next: Mark photos <Icon name="arrow" />
      </a>}
    </header>

    {canEdit ? <div className={`dropzone${over ? ' over' : ''}`} role="button" tabIndex={0}
      aria-disabled={full || busy} aria-label="Add photos: drop files here or press Enter to browse"
      onClick={browse}
      onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); browse(); } }}
      onDragOver={event => { event.preventDefault(); setOver(true); }}
      onDragLeave={() => setOver(false)}
      onDrop={event => {
        event.preventDefault();
        setOver(false);
        void add(Array.from(event.dataTransfer.files));
      }}>
      <span className="bubble">{busy ? <span className="spinner" /> : <Icon name="upload" />}</span>
      <h2>{busy ? project.saveMessage || 'Adding photos…' : full ? 'This project is full' : 'Drop photos here or click to browse'}</h2>
      <p className="muted">JPEG, PNG, WebP and other image files · up to {MAX_PHOTOS} photos per project</p>
      <div className="upload-meter" aria-label={`${photos.length} of ${MAX_PHOTOS} photos`}>
        <span className={`chip ${enough ? 'dark' : ''}`}><Icon name={enough ? 'check' : 'image'} /> {photos.length} added</span>
        {!enough && <span className="small muted">Add at least {MIN_PHOTOS_TO_TRAIN - photos.length} more to train</span>}
      </div>
      <input ref={input} type="file" accept="image/*" multiple tabIndex={-1} onChange={event => {
        void add(Array.from(event.target.files ?? []));
        event.target.value = '';
      }} />
    </div> : <div className="notice"><Icon name="lock" />You have view-only access to this workspace.</div>}

    {report && <div className={problems.length ? 'alert' : 'success'} role="status">
      <Icon name={problems.length ? 'info' : 'check'} />
      <div>
        {report.added > 0 && <strong>Added {plural(report.added, 'photo', 'photos')}. </strong>}
        {problems.join(' ')}
      </div>
    </div>}

    {project.labels.length > 0 ? <section className="card collect" aria-labelledby="collect-h">
      <div className="collect-text">
        <h2 id="collect-h"><Icon name="camera" /> Photos to collect</h2>
        <p className="muted small">Each photo can show several things. Aim for about {GOOD_PHOTOS_PER_CLASS} photos where you can see each one.</p>
        <ul className="collect-list">
          {project.labels.map(label => <li key={label}>
            <span className="swatch" style={{ background: colorFor(project.labels, label) }} />
            <span className="spacer"><code>{label}</code> <KindBadge kind={project.kindOf(label)} />
              {project.classInfo[label]?.hint && <small>{project.classInfo[label].hint}</small>}</span>
            <span className="collect-target">{GOOD_PHOTOS_PER_CLASS}+ photos</span>
          </li>)}
          <li>
            <span className="swatch" style={{ background: 'var(--line-2)' }} />
            <span className="spacer"><b>Empty</b> <small>Nothing to find: empty belt, no board</small></span>
            <span className="collect-target">2–5 photos</span>
          </li>
        </ul>
        <a className="btn link small" href={projectHref(orgId, datasetId, 'detect')}><Icon name="tag" /> Change names</a>
      </div>
      <PhotoMix passFail={project.passFail} />
    </section> : <div className="notice"><Icon name="info" /><span className="spacer">Set up what to find first, then we tell you which photos to take.</span>
      <a className="btn ghost small" href={projectHref(orgId, datasetId, 'detect')}>Set up</a></div>}

    <ul className="up-tips" aria-label="Photo tips">
      <li><span className="up-tip-icon ok"><Icon name="check" /></span><b>Good boards</b><small>10–20 photos</small></li>
      <li><span className="up-tip-icon bad"><Icon name="close" /></span><b>Bad boards</b><small>About the same</small></li>
      <li><span className="up-tip-icon"><Icon name="camera" /></span><b>Same camera</b><small>Same place, same light</small></li>
      <li><span className="up-tip-icon"><Icon name="inspect" /></span><b>Keep 5 aside</b><small>To test later</small></li>
    </ul>

    {photos.length > 0 && <section className="stack">
      <div className="page-head">
        <h2>{plural(photos.length, 'photo', 'photos')} <span className="muted small" style={{ fontWeight: 500 }}>· {project.reviewed} labeled</span></h2>
        {blurry > 0 && canEdit && <button type="button" className="btn ghost small" onClick={() => {
          if (window.confirm(`Remove ${plural(blurry, 'blurry photo', 'blurry photos')}?`)) project.setPhotos(current => current.filter(photo => !photo.blurry));
        }}>
          <Icon name="trash" /> Remove {plural(blurry, 'blurry photo', 'blurry photos')}
        </button>}
      </div>
      <div className="thumbs">
        {photos.map(photo => <div className="thumb" key={photo.id}>
          <PhotoImage photo={photo} alt={photo.filename} />
          <BoxOverlay boxes={photo.boxes} labels={project.labels} />
          <span className="tag">{photo.reviewed ? <span className="chip dark"><Icon name={photo.boxes.length ? 'box' : 'close'} /> {photo.boxes.length ? plural(photo.boxes.length, 'box', 'boxes') : 'Nothing here'}</span>
            : photo.blurry ? <span className="chip"><Icon name="alert" /> Blurry?</span>
              : <span className="chip plain"><Icon name="tag" /> Not labeled</span>}</span>
          {canEdit && <button type="button" className="icon-btn remove" aria-label={`Remove ${photo.filename}`} title="Remove photo"
            onClick={() => project.setPhotos(current => current.filter(item => item.id !== photo.id))}><Icon name="close" /></button>}
        </div>)}
      </div>
    </section>}

    {photos.length > 0 && <div className="step-actions">
      <a className="btn ghost" href="#/projects"><Icon name="back" /> All projects</a>
      <a className="btn" href={projectHref(orgId, datasetId, 'label')}>Next: Mark photos <Icon name="arrow" /></a>
    </div>}
  </main>;
}
