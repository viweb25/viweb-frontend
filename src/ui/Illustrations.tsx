/*
 * Small inline SVG pictures that teach how to label and train.
 * They use CSS classes (theme.css, "Teaching illustrations") instead of hard-coded colors.
 */
import type { ReactNode } from 'react';

import { Icon, type IconName } from './Icon';

/* ---------- Building blocks ---------- */

/** A conveyor-belt scene, 120 × 90, with optional parts drawn by children. */
function Scene({ children, title }: { children: ReactNode; title: string }) {
  return <svg className="ill-scene" viewBox="0 0 120 90" role="img" aria-label={title}>
    <rect className="ill-bg" x="0" y="0" width="120" height="90" rx="8" />
    <path className="ill-belt" d="M0 70h120M0 76h120" />
    {children}
  </svg>;
}

/** A bottle cap seen from above. `defect` adds a crack. */
function Cap({ x, y, r = 16, defect = false }: { x: number; y: number; r?: number; defect?: boolean }) {
  return <g>
    <circle className="ill-obj" cx={x} cy={y} r={r} />
    <circle className="ill-obj-inner" cx={x} cy={y} r={r * .62} />
    {defect && <path className="ill-crack" d={`M${x - r * .7} ${y - r * .5} l${r * .5} ${r * .35} l-${r * .15} ${r * .35} l${r * .6} ${r * .4}`} />}
  </g>;
}

function LabelBox({ x, y, w, h, tone }: { x: number; y: number; w: number; h: number; tone: 'ok' | 'bad' }) {
  return <rect className={`ill-box ${tone}`} x={x} y={y} width={w} height={h} rx="2" />;
}

function Verdict({ ok }: { ok: boolean }) {
  return <span className={`ill-verdict ${ok ? 'ok' : 'bad'}`}><Icon name={ok ? 'check' : 'close'} /></span>;
}

/* ---------- How to draw a box ---------- */

const BOX_EXAMPLES: { ok: boolean; title: string; text: string; art: ReactNode }[] = [
  {
    ok: true, title: 'Tight and complete', text: 'The box touches the edges of the whole object.',
    art: <><Cap x={60} y={42} /><LabelBox x={43} y={25} w={34} h={34} tone="ok" /></>,
  },
  {
    ok: false, title: 'Too loose', text: 'Lots of background inside the box confuses the model.',
    art: <><Cap x={60} y={42} /><LabelBox x={22} y={10} w={76} h={62} tone="bad" /></>,
  },
  {
    ok: false, title: 'Cuts it off', text: 'Part of the object is outside the box.',
    art: <><Cap x={60} y={42} /><LabelBox x={52} y={32} w={26} h={20} tone="bad" /></>,
  },
  {
    ok: false, title: 'Missed one', text: 'Every object in the photo needs its own box.',
    art: <><Cap x={36} y={42} r={13} /><Cap x={84} y={42} r={13} /><LabelBox x={21} y={27} w={30} h={30} tone="ok" /></>,
  },
];

/** Four side-by-side examples of good and bad boxes. */
export function BoxExamples() {
  return <div className="ill-grid" role="list" aria-label="Examples of good and bad boxes">
    {BOX_EXAMPLES.map(example => <figure key={example.title} className={`ill-card ${example.ok ? 'ok' : 'bad'}`} role="listitem">
      <div className="ill-art"><Scene title={example.title}>{example.art}</Scene><Verdict ok={example.ok} /></div>
      <figcaption><strong>{example.title}</strong><span>{example.text}</span></figcaption>
    </figure>)}
  </div>;
}

/* ---------- Which photos to upload ---------- */

/** The three kinds of photo a project needs. Pass/fail projects show good and defective parts. */
export function PhotoMix({ passFail }: { passFail: boolean }) {
  const items: { title: string; text: string; art: ReactNode }[] = passFail ? [
    { title: 'Good parts', text: '10–20 photos', art: <Cap x={60} y={42} /> },
    { title: 'Defective parts', text: 'About as many as good', art: <Cap x={60} y={42} defect /> },
    { title: 'Empty scene', text: '2–5 photos', art: null },
  ] : [
    { title: 'One object', text: 'Many angles', art: <Cap x={60} y={42} /> },
    { title: 'Several objects', text: 'Box each one', art: <><Cap x={36} y={42} r={13} /><Cap x={84} y={42} r={13} /></> },
    { title: 'Empty scene', text: '2–5 photos', art: null },
  ];
  return <div className="ill-grid three" role="list" aria-label="Kinds of photo to upload">
    {items.map(item => <figure key={item.title} className="ill-card" role="listitem">
      <div className="ill-art"><Scene title={item.title}>{item.art}</Scene></div>
      <figcaption><strong>{item.title}</strong><span>{item.text}</span></figcaption>
    </figure>)}
  </div>;
}

/* ---------- What training does ---------- */

const TRAINING_FLOW: { icon: IconName; title: string; text: string }[] = [
  { icon: 'image', title: 'Your labeled photos', text: 'Every box you drew is an example.' },
  { icon: 'layers', title: 'Split', text: 'About 70% to study, 30% kept aside to check.' },
  { icon: 'refresh', title: 'Learn', text: 'The model studies the photos many times.' },
  { icon: 'target', title: 'Check', text: 'It is scored on photos it never studied.' },
  { icon: 'star', title: 'Your model', text: 'Low, OK, Good or Great. Ready to test.' },
];

/** Five boxes joined by arrows: what happens after "Start training". */
export function TrainingFlow() {
  return <ol className="flow-steps" aria-label="What happens during training">
    {TRAINING_FLOW.map((step, index) => <li key={step.title}>
      <span className="flow-icon"><Icon name={step.icon} /></span>
      <span className="flow-num">{index + 1}</span>
      <strong>{step.title}</strong>
      <small>{step.text}</small>
    </li>)}
  </ol>;
}

/* ---------- Improve loop ---------- */

const LOOP: { icon: IconName; label: string; angle: number }[] = [
  { icon: 'upload', label: 'Add photos', angle: -90 },
  { icon: 'tag', label: 'Label', angle: 0 },
  { icon: 'play', label: 'Train', angle: 90 },
  { icon: 'inspect', label: 'Test', angle: 180 },
];

/** A circle of the four steps with arrows, to show that teaching is repeated. */
export function TeachingLoop({ current }: { current?: 'upload' | 'label' | 'train' | 'test' }) {
  const keys = ['upload', 'label', 'train', 'test'];
  const radius = 70;
  const point = (angle: number, r = radius) => [100 + r * Math.cos(angle * Math.PI / 180), 100 + r * Math.sin(angle * Math.PI / 180)];
  const arc = (from: number, to: number) => {
    const [x1, y1] = point(from + 22);
    const [x2, y2] = point(to - 22);
    return `M${x1.toFixed(1)} ${y1.toFixed(1)} A${radius} ${radius} 0 0 1 ${x2.toFixed(1)} ${y2.toFixed(1)}`;
  };
  return <div className="loop">
    <svg viewBox="0 0 200 200" role="img" aria-label="Add photos, label, train, test, then repeat to improve">
      <defs>
        <marker id="loop-arrow" viewBox="0 0 10 10" refX="7" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
          <path d="M0 0 10 5 0 10z" className="loop-head" />
        </marker>
      </defs>
      {LOOP.map((step, index) => <path key={step.label} className="loop-arc" markerEnd="url(#loop-arrow)"
        d={arc(step.angle, LOOP[(index + 1) % LOOP.length].angle + (index === LOOP.length - 1 ? 360 : 0))} />)}
      <text x="100" y="96" textAnchor="middle" className="loop-center">Repeat</text>
      <text x="100" y="112" textAnchor="middle" className="loop-center small">to improve</text>
    </svg>
    {LOOP.map((step, index) => {
      const [x, y] = point(step.angle);
      return <span key={step.label} className={`loop-node${current === keys[index] ? ' on' : ''}`}
        style={{ left: `${x / 2}%`, top: `${y / 2}%` }}>
        <Icon name={step.icon} /><b>{step.label}</b>
      </span>;
    })}
  </div>;
}

/* ---------- Ways to teach ---------- */

const WAYS: { icon: IconName; title: string; text: string; where: string }[] = [
  {
    icon: 'box', title: 'Draw boxes yourself',
    text: 'Pick what you see, drag a box around it. The surest way: the model copies exactly what you show.',
    where: 'Label step',
  },
  {
    icon: 'sparkle', title: 'Let the model suggest, you correct',
    text: 'After a first model exists, click “Let the model suggest boxes”. Delete wrong boxes, add missed ones.',
    where: 'Label step, after first training',
  },
  {
    icon: 'close', title: 'Mark empty photos',
    text: 'Say “nothing here” for photos without objects. This teaches the model what to ignore and cuts false alarms.',
    where: 'Label step (key E)',
  },
  {
    icon: 'refresh', title: 'Learn from mistakes',
    text: 'Test on new photos. Where it misses or is wrong, upload more photos like those, label them, train again.',
    where: 'Test → Upload → Train',
  },
];

/** Cards listing every way to teach the model inside the app, plus the developer route. */
export function WaysToTeach() {
  return <div className="ways">
    <ol className="ways-grid">
      {WAYS.map((way, index) => <li key={way.title} className="way">
        <span className="way-icon"><Icon name={way.icon} /></span>
        <span className="way-num">{index + 1}</span>
        <strong>{way.title}</strong>
        <p>{way.text}</p>
        <small><Icon name="flag" /> {way.where}</small>
      </li>)}
    </ol>
  </div>;
}
