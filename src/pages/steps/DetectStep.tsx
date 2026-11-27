import { navigate } from '../../ui/navigation';
import { useState, type FormEvent } from 'react';

import { Icon } from '../../ui/Icon';
import { BoxExamples } from '../../ui/Illustrations';
import { KindBadge } from '../../ui/KindBadge';
import { LabelExample } from '../../ui/LabelExample';
import { ErrorBox, classColor, errorText, projectHref } from '../../ui/common';
import { LABEL_EXAMPLE } from '../../ui/inspectionExample';
import type { Project } from '../project/useProject';
import { ClassesModal } from './label/ClassesModal';

export function DetectStep({ project, orgId, datasetId }: { project: Project; orgId: string; datasetId: string }) {
  const [editingLabels, setEditingLabels] = useState(false);
  const [error, setError] = useState('');
  const [continuing, setContinuing] = useState(false);
  const photosHref = projectHref(orgId, datasetId, 'upload');
  const canUseExample = project.canEdit && !project.labels.length && !project.photos.length;

  function useExample() {
    const problem = project.applyClasses(LABEL_EXAMPLE.labels.map(label => ({ ...label })));
    if (problem) { setError(problem); return; }
    project.setName(LABEL_EXAMPLE.project);
    project.setNote(LABEL_EXAMPLE.instruction);
    setError('');
  }

  async function continueToPhotos(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (continuing || !project.name.trim() || !project.labels.length) return;
    setContinuing(true);
    setError('');
    try {
      if (project.dirty || project.saving) await project.save();
      navigate(photosHref);
    } catch (cause) {
      setError(errorText(cause, 'Could not save the project.'));
    } finally {
      setContinuing(false);
    }
  }

  return <main className="page workspace-page">
    <header className="page-head">
      <div><h1>Define your inspection</h1><p>Tell the model what to look for in each photo.</p></div>
      {!project.canEdit && <a className="btn ghost" href={photosHref}>View photos <Icon name="arrow" /></a>}
    </header>

    <div className="workspace-columns">
      <form className="stack setup-form" onSubmit={event => void continueToPhotos(event)}>
        <section className="card workspace-panel">
          <h2>Project details</h2>
          <label className="field">Project name
            <input required maxLength={80} value={project.name} disabled={!project.canEdit || continuing}
              placeholder={LABEL_EXAMPLE.project} onChange={event => project.setName(event.target.value)} />
          </label>
          <label className="field">What should this inspection check?
            <textarea rows={3} maxLength={400} value={project.note} disabled={!project.canEdit || continuing}
              placeholder={LABEL_EXAMPLE.instruction} onChange={event => project.setNote(event.target.value)} />
          </label>
        </section>
        <section className="card workspace-panel">
          <div className="row">
            <h2 className="spacer">Labels to teach</h2>
            {project.canEdit && <button type="button" className="btn ghost" disabled={continuing}
              onClick={() => setEditingLabels(true)}><Icon name={project.labels.length ? 'sliders' : 'plus'} />
              {project.labels.length ? 'Edit labels' : 'Add labels'}</button>}
          </div>
          {project.labels.length ? <ul className="workspace-list label-summary">
            {project.labels.map((label, index) => <li key={label}>
              <span className="swatch" style={{ background: classColor(index) }} />
              <div className="spacer"><strong>{label}</strong>
                {project.classInfo[label]?.hint && <small>{project.classInfo[label].hint}</small>}</div>
              <KindBadge kind={project.kindOf(label)} showObject />
              <small>{project.labelCounts[label] ?? 0} photos</small>
            </li>)}
          </ul> : <p className="muted">Use one clear name for each visible thing the model should learn, such as “Straight label”.</p>}
        </section>
        {error && <ErrorBox message={error} />}
        {project.canEdit && <div className="row setup-actions">
          <span className="spacer small muted">{project.labels.length ? 'Next, collect photos for these labels.' : 'Add a label to continue.'}</span>
          <button type="submit" className="btn dark" disabled={!project.labels.length || !project.name.trim() || continuing}>
            {continuing ? 'Saving…' : 'Continue to photos'} <Icon name="arrow" />
          </button>
        </div>}
      </form>
      <aside className="stack">
        <LabelExample />
        {canUseExample && <button type="button" className="btn ghost" onClick={useExample}><Icon name="plus" /> Use this example</button>}
        <section className="card workspace-panel">
          <h2>Before you take photos</h2>
          <p>Keep the camera in the same position. Collect different boxes and include both straight and crooked labels if those are your classes.</p>
          <details><summary>How to draw a label box</summary><BoxExamples /></details>
        </section>
      </aside>
    </div>
    {editingLabels && <ClassesModal project={project} onClose={() => setEditingLabels(false)} />}
  </main>;
}
