import { useRef, useState } from 'react';

import { Icon } from '../../ui/Icon';
import { PhotoMix, TeachingLoop } from '../../ui/Illustrations';
import { projectHref } from '../../ui/common';
import { BoxOverlay, PhotoImage } from '../project/PhotoViews';
import { MAX_PHOTOS, MIN_PHOTOS_TO_TRAIN, type AddResult, type Project } from '../project/useProject';

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
        <span className="eyebrow"><Icon name="upload" /> Step 1 of 5</span>
        <h1 style={{ marginTop: '.3rem' }}>Upload your photos</h1>
        <p>Add photos that look like what your camera will see. Next you will name what the model should find and mark it in your photos.</p>
      </div>
      {photos.length > 0 && <a className="btn" href={projectHref(orgId, datasetId, 'label')}>
        Next: Label {plural(photos.length, 'photo', 'photos')} <Icon name="arrow" />
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

    <section className="card explain">
      <h2><Icon name="lightbulb" /> Which photos should I upload?</h2>
      <PhotoMix passFail={project.passFail} />
      {project.passFail ? <ul className="checklist">
        <li className="ok"><span className="mark"><Icon name="check" /></span><span><b>Good ones:</b> {classList(project, 'good')}. About 10–20 photos.</span></li>
        <li className="warn"><span className="mark"><Icon name="alert" /></span><span><b>Defective ones:</b> {classList(project, 'defect')}. About the same number as the good ones.</span></li>
        <li className="ok"><span className="mark"><Icon name="check" /></span><span><b>A few empty photos</b> (nothing to check in view). 2–5 photos.</span></li>
        <li className="ok"><span className="mark"><Icon name="check" /></span><span>Upload them <b>all together, mixed</b>. You say which is which in the next step.</span></li>
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

    <section className="card explain loop-card">
      <TeachingLoop current="upload" />
      <div className="stack" style={{ gap: '.6rem' }}>
        <h2>Teaching is a loop, not a one-off</h2>
        <p className="muted">Your first model will make mistakes. That is normal. Test it, then add photos like the ones it got wrong, label them and train again.
          Each round makes it better.</p>
        <p className="small muted"><Icon name="info" /> You can come back to this step any time to add more photos.</p>
      </div>
    </section>

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
      <a className="btn ghost" href="#/"><Icon name="back" /> All projects</a>
      <a className="btn" href={projectHref(orgId, datasetId, 'label')}>Next: Label photos <Icon name="arrow" /></a>
    </div>}
  </main>;
}

/** The classes of one kind with their hints, or a plain description when there are none yet. */
function classList(project: Project, kind: 'good' | 'defect') {
  const names = project.labels.filter(label => project.kindOf(label) === kind)
    .map(label => `${label}${project.classInfo[label]?.hint ? ` (${project.classInfo[label].hint})` : ''}`);
  if (names.length) return names.join(', ');
  return kind === 'good' ? 'parts that look right' : 'parts with a problem (add a Defect class in Label → Edit to flag them)';
}
