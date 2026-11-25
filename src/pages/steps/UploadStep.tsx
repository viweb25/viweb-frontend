import { useRef, useState } from 'react';

import { Icon } from '../../ui/Icon';
import { projectHref } from '../../ui/common';
import { BoxOverlay, MAX_PHOTOS, PhotoImage, type AddResult, type Project } from '../ProjectStudio';

export function UploadStep({ project, orgId, datasetId }: { project: Project; orgId: string; datasetId: string }) {
  const [over, setOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const [report, setReport] = useState<AddResult | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const { photos, canEdit } = project;
  const full = photos.length >= MAX_PHOTOS;

  async function add(files: File[]) {
    if (!files.length || busy || !canEdit) return;
    setBusy(true);
    setReport(null);
    try {
      setReport(await project.addFiles(files));
    } finally {
      setBusy(false);
    }
  }

  const problems = report && [
    report.duplicates.length ? `Skipped ${report.duplicates.length} duplicate ${report.duplicates.length === 1 ? 'photo' : 'photos'}.` : '',
    report.rejected.length ? `Could not open: ${report.rejected.slice(0, 5).join(', ')}${report.rejected.length > 5 ? '…' : ''}.` : '',
    report.overLimit ? `${report.overLimit} not added: a project holds up to ${MAX_PHOTOS} photos.` : '',
    report.blurry.length ? `${report.blurry.length} ${report.blurry.length === 1 ? 'photo looks' : 'photos look'} blurry. You can keep or remove ${report.blurry.length === 1 ? 'it' : 'them'}.` : '',
  ].filter(Boolean);

  return <main className="page">
    <header className="page-head">
      <div>
        <span className="eyebrow">Step 1 of 5</span>
        <h1 style={{ marginTop: '.3rem' }}>Upload your photos</h1>
        <p>Add photos that look like what your camera will see. In the next step, you’ll name what the model should find and mark it in your photos.</p>
      </div>
      {photos.length > 0 && <a className="btn" href={projectHref(orgId, datasetId, 'label')}>
        Next: Label {photos.length} {photos.length === 1 ? 'photo' : 'photos'} <Icon name="arrow" />
      </a>}
    </header>

    {canEdit ? <div className={`dropzone${over ? ' over' : ''}`} role="button" tabIndex={0}
      aria-disabled={full || busy}
      onClick={() => { if (!full && !busy) input.current?.click(); }}
      onKeyDown={event => { if ((event.key === 'Enter' || event.key === ' ') && !full && !busy) { event.preventDefault(); input.current?.click(); } }}
      onDragOver={event => { event.preventDefault(); setOver(true); }}
      onDragLeave={() => setOver(false)}
      onDrop={event => {
        event.preventDefault();
        setOver(false);
        if (!full) void add(Array.from(event.dataTransfer.files));
      }}>
      <span className="bubble">{busy ? <span className="spinner" /> : <Icon name="upload" />}</span>
      <h2>{busy ? project.saveMessage || 'Adding photos…' : full ? 'This project is full' : 'Drop photos here or click to browse'}</h2>
      <p className="muted">JPEG, PNG, WebP and other image files · up to {MAX_PHOTOS} photos per project · {photos.length} added</p>
      <input ref={input} type="file" accept="image/*" multiple tabIndex={-1} onChange={event => {
        void add(Array.from(event.target.files ?? []));
        event.target.value = '';
      }} />
    </div> : <div className="notice"><Icon name="lock" />You have view-only access to this workspace.</div>}

    {report && <div className={problems?.length ? 'alert' : 'success'} role="status">
      <Icon name={problems?.length ? 'info' : 'check'} />
      <div>
        {report.added > 0 && <strong>Added {report.added} {report.added === 1 ? 'photo' : 'photos'}. </strong>}
        {problems?.join(' ')}
      </div>
    </div>}

    <section className="card explain">
      <h2>Which photos should I upload?</h2>
      {project.passFail ? <ul className="checklist">
        <li className="ok"><span className="mark"><Icon name="check" /></span><span><b>Good ones:</b> {project.labels.filter(label => project.kindOf(label) === 'good').map(label =>
          `${label}${project.classInfo[label]?.hint ? ` (${project.classInfo[label].hint})` : ''}`).join(', ')}. About 10–20 photos.</span></li>
        <li className="warn"><span className="mark"><Icon name="alert" /></span><span><b>Defective ones:</b> {project.labels.filter(label => project.kindOf(label) === 'defect').map(label =>
          `${label}${project.classInfo[label]?.hint ? ` (${project.classInfo[label].hint})` : ''}`).join(', ')}. About the same number as the good ones.</span></li>
        <li className="ok"><span className="mark"><Icon name="check" /></span><span><b>A few empty photos</b> (nothing to check in view). 2–5 photos.</span></li>
        <li className="ok"><span className="mark"><Icon name="check" /></span><span>Upload them <b>all together, mixed</b>. You don't sort them here; you say which is which in the next step.</span></li>
      </ul> : <ul className="checklist">
        <li className="ok"><span className="mark"><Icon name="check" /></span><span>Photos showing {project.labels.length ? project.labels.join(', ') : 'what you want the model to find'}. Aim for 10–20 photos for each kind of thing.</span></li>
        <li className="ok"><span className="mark"><Icon name="check" /></span><span><b>A few empty photos</b> with nothing to find, so the model learns what to ignore.</span></li>
      </ul>}
      <div className="tips">
        <div className="tip"><Icon name="camera" /><div><strong>Same setup as production</strong><p>Same camera angle, distance and lighting you will inspect with.</p></div></div>
        <div className="tip"><Icon name="layers" /><div><strong>Variety helps</strong><p>Different positions, backgrounds and lighting make the model more reliable.</p></div></div>
        <div className="tip"><Icon name="inspect" /><div><strong>Keep a few aside</strong><p>Don't upload every photo. Keep 5–10 new ones to test the model later.</p></div></div>
      </div>
    </section>

    {photos.length > 0 && <section className="stack">
      <div className="page-head">
        <h2>{photos.length} {photos.length === 1 ? 'photo' : 'photos'} <span className="muted small" style={{ fontWeight: 500 }}>· {project.reviewed} labeled</span></h2>
        {photos.some(photo => photo.blurry) && canEdit && <button type="button" className="btn ghost small" onClick={() =>
          project.setPhotos(current => current.filter(photo => !photo.blurry))}>
          <Icon name="trash" /> Remove blurry photos
        </button>}
      </div>
      <div className="thumbs">
        {photos.map(photo => <div className="thumb" key={photo.id}>
          <PhotoImage photo={photo} alt={photo.filename} />
          <BoxOverlay boxes={photo.boxes} labels={project.labels} />
          <span className="tag">{photo.reviewed ? <span className="chip dark"><Icon name="check" /> {photo.boxes.length ? `${photo.boxes.length} boxes` : 'Nothing here'}</span>
            : photo.blurry ? <span className="chip"><Icon name="alert" /> Blurry?</span>
              : <span className="chip plain">Not labeled</span>}</span>
          {canEdit && <button type="button" className="icon-btn remove" aria-label={`Remove ${photo.filename}`} title="Remove photo"
            onClick={() => project.setPhotos(current => current.filter(item => item.id !== photo.id))}><Icon name="close" /></button>}
        </div>)}
      </div>
    </section>}

    {photos.length > 0 && <div className="step-actions">
      <a className="btn ghost" href="#/"><Icon name="back" /> All projects</a>
      <a className="btn" href={projectHref(orgId, datasetId, 'label')}>Next: Label photos <Icon name="arrow" /></a>
    </div>}
  </main>;
}
