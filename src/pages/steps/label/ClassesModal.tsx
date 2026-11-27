import { useState } from 'react';

import type { ClassKind } from '../../../services/api/trainingDatasets';
import { Icon } from '../../../ui/Icon';
import { KindBadge } from '../../../ui/KindBadge';
import { LABEL_EXAMPLE } from '../../../ui/inspectionExample';
import { KIND_LABEL, Modal, colorFor } from '../../../ui/common';
import type { ClassEdit, Project } from '../../project/useProject';

const KIND_HELP: Record<ClassKind, string> = {
  good: 'What you expect to see.',
  defect: 'A visible problem to flag.',
  object: 'Just found and counted.',
};

/** Edit the list of classes (what the model learns) in one go. */
export function ClassesModal({ project, onClose }: { project: Project; onClose: () => void }) {
  const [rows, setRows] = useState<ClassEdit[]>(() => project.labels.length
    ? project.labels.map(label => ({
      original: label, name: label, kind: project.kindOf(label), hint: project.classInfo[label]?.hint ?? '',
    }))
    : [{ name: '', kind: 'object', hint: '' }]);
  const [error, setError] = useState('');
  const empty = rows.every(row => !row.name.trim() && !row.original);

  function update(position: number, change: Partial<ClassEdit>) {
    setRows(current => current.map((row, item) => item === position ? { ...row, ...change } : row));
  }

  function remove(position: number) {
    const row = rows[position];
    const used = row.original ? project.labelCounts[row.original] ?? 0 : 0;
    if (used && !window.confirm(`“${row.original}” is used in ${used} ${used === 1 ? 'photo' : 'photos'}. Remove it and delete those boxes?`)) return;
    setRows(current => current.filter((_, item) => item !== position));
  }

  function save() {
    const problem = project.applyClasses(rows);
    if (problem) setError(problem);
    else onClose();
  }

  return <Modal title="What should the model learn?" wide onClose={onClose}
    description="Each class is one kind of thing you will draw boxes around. Mark good and defective versions to get PASS / FAIL results."
    footer={<>
      <button type="button" className="btn ghost" onClick={onClose}>Cancel</button>
      <button type="button" className="btn" onClick={save}><Icon name="check" /> Save classes</button>
    </>}>
    <dl className="kind-help small">
      {(['good', 'defect', 'object'] as const).map(kind => <div key={kind}>
        <dt><KindBadge kind={kind} showObject /></dt><dd>{KIND_HELP[kind]}</dd>
      </div>)}
    </dl>

    {empty && <div className="stack" style={{ gap: '.5rem' }}>
      <button type="button" className="btn ghost" onClick={() => setRows(LABEL_EXAMPLE.labels.map(label => ({ ...label })))}>
        <Icon name="tag" /> Use box label example
      </button>
    </div>}

    <div className="class-table">
      <div className="class-table-head"><span>Name</span><span>Type</span><span>How to recognise it (optional)</span><span /></div>
      {rows.map((row, position) => <div className="class-table-row" key={position}>
        <span className="input-swatch">
          <span className="swatch" style={{ background: colorFor(rows.map(item => item.name), row.name) }} />
          <input className="input" aria-label={`Name of class ${position + 1}`} value={row.name} maxLength={80} placeholder={LABEL_EXAMPLE.labels[0].name}
            onChange={event => update(position, { name: event.target.value })} />
        </span>
        <div className="seg kind-seg" role="group" aria-label={`Type of class ${position + 1}`}>
          {(['good', 'defect', 'object'] as const).map(kind => <button key={kind} type="button" aria-pressed={row.kind === kind}
            title={KIND_HELP[kind]} onClick={() => update(position, { kind })}>{KIND_LABEL[kind]}</button>)}
        </div>
        <input className="input" aria-label={`Hint for class ${position + 1}`} value={row.hint} maxLength={120} placeholder="What to look for"
          onChange={event => update(position, { hint: event.target.value })} />
        <button type="button" className="icon-btn" aria-label={`Remove ${row.name || 'class'}`} title="Remove class"
          onClick={() => remove(position)}><Icon name="trash" /></button>
      </div>)}
    </div>
    <div className="row">
      <button type="button" className="btn ghost small" onClick={() => setRows(current => [...current, { name: '', kind: 'object', hint: '' }])}>
        <Icon name="plus" /> Add a class</button>
      <span className="small muted">Renaming a class keeps its boxes. Removing it deletes its boxes.</span>
    </div>
    <div className="tip-box small">
      <Icon name="lightbulb" /><span>Use the same name for the same thing in every photo. Spaces and capital letters are fine. Mark visible problems as <b>Defect</b>.</span>
    </div>
    {error && <div className="alert" role="alert"><Icon name="alert" />{error}</div>}
  </Modal>;
}
