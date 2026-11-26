import { useState } from 'react';

import { useWorkspace } from '../../context/WorkspaceContext';
import { Icon, type IconName } from '../../ui/Icon';
import { CreateProject } from '../Dashboard';

type PathStep = { icon: IconName; title: string; text: string };

/** How object detection works in Vision Studio, in six short steps. */
const PATH: PathStep[] = [
  { icon: 'upload', title: 'Add photos', text: 'Photos of your board from your camera.' },
  { icon: 'box', title: 'Mark the parts', text: 'Draw a box around each part.' },
  { icon: 'play', title: 'Train', text: 'One click. We do the rest.' },
  { icon: 'inspect', title: 'Test', text: 'Try photos it has never seen.' },
  { icon: 'grid', title: 'Set up the check', text: 'Draw zones. Show one good board.' },
  { icon: 'flag', title: 'Check boards', text: 'Pass or fail, every board saved.' },
];

const TIPS: { icon: IconName; title: string; text: string }[] = [
  { icon: 'camera', title: 'Fixed camera', text: 'Same place, every photo' },
  { icon: 'lightbulb', title: 'Same light', text: 'No glare on metal' },
  { icon: 'layers', title: 'Many photos', text: 'Good and bad boards' },
];

const SOON: { icon: IconName; name: string; key: string }[] = [
  { icon: 'sparkle', name: 'Anomaly detection', key: 'anomaly-detection' },
  { icon: 'bolt', name: 'Electrical testing', key: 'electrical-test' },
  { icon: 'clock', name: 'Predictive maintenance', key: 'predictive-maintenance' },
  { icon: 'tag', name: 'Label reading', key: 'ocr' },
];

export function GuidePage() {
  const { org, canEdit } = useWorkspace();
  const [creating, setCreating] = useState(false);

  return <main className="page">
    <header className="page-head">
      <div>
        <span className="eyebrow"><Icon name="target" /> Object detection</span>
        <h1 style={{ marginTop: '.3rem' }}>How it works</h1>
        <p>Teach it once with your photos. Then it checks every board for you.</p>
      </div>
      {canEdit && <button type="button" className="btn" onClick={() => setCreating(true)}>
        <Icon name="plus" /> Create Project
      </button>}
    </header>

    <ol className="path">
      {PATH.map((step, index) => <li key={step.title} className="path-step">
        <span className="path-n">{index + 1}</span>
        <span className="path-icon"><Icon name={step.icon} /></span>
        <strong>{step.title}</strong>
        <p>{step.text}</p>
      </li>)}
    </ol>

    <section className="tip-row" aria-label="Before you start">
      <h2><Icon name="lightbulb" /> Before you start</h2>
      {TIPS.map(tip => <div key={tip.title} className="tip-tile">
        <span className="path-icon small"><Icon name={tip.icon} /></span>
        <span><b>{tip.title}</b><small>{tip.text}</small></span>
      </div>)}
    </section>

    <section className="soon-row" aria-label="Coming soon">
      <span className="muted small"><Icon name="clock" /> Coming soon</span>
      {SOON.map(item => <a key={item.key} className="chip plain" href={`#/modules/${item.key}`}><Icon name={item.icon} /> {item.name}</a>)}
    </section>
    {creating && canEdit && org && <CreateProject orgId={org.org_id} onClose={() => setCreating(false)} />}
  </main>;
}
