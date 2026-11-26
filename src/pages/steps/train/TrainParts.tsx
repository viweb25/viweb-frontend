/* Visual building blocks for the Train step: few words, mostly pictures. */
import { Icon, type IconName } from '../../../ui/Icon';
import { colorFor } from '../../../ui/common';
import { GOOD_PHOTOS_PER_CLASS, MIN_PHOTOS_PER_CLASS, type Project } from '../../project/useProject';
import { PRESETS, type Preset } from './AdvancedSettings';

type TileState = 'ok' | 'warn' | 'bad';

function Tile({ icon, value, label, state, hint }: { icon: IconName; value: string; label: string; state: TileState; hint?: string }) {
  return <div className={`stat-tile ${state}`}>
    <span className="st-icon"><Icon name={icon} /></span>
    <span className="st-mark"><Icon name={state === 'ok' ? 'check' : state === 'warn' ? 'alert' : 'close'} /></span>
    <strong>{value}</strong>
    <span className="st-label">{label}</span>
    {hint && <small>{hint}</small>}
  </div>;
}

/** Part 1: are the photos ready? Four tiles plus one bar per thing to find. */
export function PhotoReadiness({ project, fixHref }: { project: Project; fixHref: string }) {
  const total = project.photos.length;
  const labeled = project.reviewed;
  const empty = project.photos.filter(photo => photo.reviewed && !photo.boxes.length).length;
  const boxes = project.photos.reduce((sum, photo) => sum + photo.boxes.length, 0);
  const thin = project.labels.filter(label => (project.labelCounts[label] ?? 0) < MIN_PHOTOS_PER_CLASS);

  return <section className="train-part">
    <PartTitle n={1} icon="image" title="Your photos" />
    <div className="stat-tiles">
      <Tile icon="image" value={String(total)} label="Photos" state={total >= 4 ? 'ok' : 'bad'} hint={total < 4 ? 'Need 4+' : undefined} />
      <Tile icon="tag" value={`${labeled}/${total}`} label="Labeled" state={labeled === total && total ? 'ok' : 'bad'}
        hint={labeled < total ? `${total - labeled} to go` : undefined} />
      <Tile icon="box" value={String(boxes)} label="Boxes drawn" state={boxes ? 'ok' : 'bad'} />
      <Tile icon="close" value={String(empty)} label="Empty photos" state={empty ? 'ok' : 'warn'} hint={empty ? undefined : 'Add 2–5'} />
    </div>
    <div className="class-bars">
      {project.labels.map(label => {
        const count = project.labelCounts[label] ?? 0;
        const state: TileState = count < MIN_PHOTOS_PER_CLASS ? 'bad' : count < GOOD_PHOTOS_PER_CLASS ? 'warn' : 'ok';
        return <div key={label} className={`class-bar ${state}`}>
          <span className="swatch" style={{ background: colorFor(project.labels, label) }} />
          <b>{label}</b>
          <span className="cb-track"><span style={{ width: `${Math.min(100, 100 * count / GOOD_PHOTOS_PER_CLASS)}%`, background: colorFor(project.labels, label) }} /></span>
          <span className="cb-count">{count}<small>/{GOOD_PHOTOS_PER_CLASS}</small></span>
        </div>;
      })}
    </div>
    {(project.blockedReason || thin.length > 0) && <a className="fix-strip" href={fixHref}>
      <Icon name="alert" /><span className="spacer">{project.blockedReason || `Add more photos of: ${thin.join(', ')}`}</span>
      <b>Fix <Icon name="arrow" /></b>
    </a>}
  </section>;
}

export function PartTitle({ n, icon, title }: { n: number; icon: IconName; title: string }) {
  return <h2 className="part-title"><span className="pt-n">{n}</span><Icon name={icon} />{title}</h2>;
}

/** Part 2: a drawing of what training does. Photos → study / check → model → score. */
export function TrainingDiagram() {
  return <section className="train-part">
    <PartTitle n={2} icon="help" title="What happens" />
    <svg className="train-diagram" viewBox="0 0 770 210" role="img"
      aria-label="Your photos are split: most are studied by the model, some are kept to check it. Then you get a score.">
      <defs>
        <marker id="td-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto">
          <path d="M0 0 10 5 0 10z" className="td-head" />
        </marker>
        <marker id="td-arrow-sm" viewBox="0 0 10 10" refX="6" refY="5" markerWidth="3.5" markerHeight="3.5" orient="auto">
          <path d="M0 0 10 5 0 10z" className="td-head light" />
        </marker>
      </defs>
      {/* Photo stack */}
      <g transform="translate(20 55)">
        {[16, 8, 0].map(offset => <g key={offset} transform={`translate(${offset} ${-offset})`}>
          <rect className="td-photo" width="96" height="72" rx="8" />
          <circle className="td-part" cx="48" cy="38" r="15" />
          <rect className="td-box" x="29" y="19" width="38" height="38" rx="3" />
        </g>)}
        <text className="td-label" x="56" y="110" textAnchor="middle">Your photos</text>
      </g>
      {/* Split */}
      <path className="td-line" d="M150 90 C 190 90, 190 50, 228 50" markerEnd="url(#td-arrow)" />
      <path className="td-line" d="M150 100 C 190 100, 190 150, 228 150" markerEnd="url(#td-arrow)" />
      <g transform="translate(236 18)">
        <rect className="td-pile study" width="120" height="62" rx="12" />
        <text className="td-big" x="60" y="30" textAnchor="middle">70%</text>
        <text className="td-small" x="60" y="49" textAnchor="middle">to study</text>
      </g>
      <g transform="translate(236 118)">
        <rect className="td-pile check" width="120" height="62" rx="12" />
        <text className="td-big" x="60" y="30" textAnchor="middle">30%</text>
        <text className="td-small" x="60" y="49" textAnchor="middle">kept to check</text>
      </g>
      {/* Model */}
      <path className="td-line" d="M360 49 C 400 49, 400 95, 436 95" markerEnd="url(#td-arrow)" />
      <g transform="translate(440 50)">
        <rect className="td-model" width="128" height="92" rx="18" />
        <path className="td-loop" d="M50 40 a16 16 0 1 1 16 16" markerEnd="url(#td-arrow-sm)" />
        <text className="td-small light" x="64" y="80" textAnchor="middle">learns</text>
        <text className="td-label" x="64" y="-8" textAnchor="middle">Your model</text>
      </g>
      {/* Check → score */}
      <path className="td-line dashed" d="M360 150 C 470 150, 520 175, 600 150" markerEnd="url(#td-arrow)" />
      <path className="td-line" d="M572 96 L 604 96" markerEnd="url(#td-arrow)" />
      <g transform="translate(612 40)">
        <rect className="td-photo" width="140" height="112" rx="14" />
        <text className="td-label" x="70" y="26" textAnchor="middle">Score</text>
        {['Low', 'OK', 'Good', 'Great'].map((label, index) => <g key={label} transform={`translate(14 ${38 + index * 17})`}>
          <rect className={`td-band b${index}`} width={20 + index * 16} height="12" rx="6" />
          <text className="td-tiny" x={26 + index * 16} y="10">{label}</text>
        </g>)}
      </g>
    </svg>
  </section>;
}

/** A small speedometer drawing. `level` 1 (slow, best) to 3 (fast). */
function Gauge({ level }: { level: number }) {
  const angle = -150 + level * 75; // -75°, 0°, 75°
  return <svg className="gauge" viewBox="0 0 100 60" aria-hidden="true">
    <path className="g-track" d="M10 55 A40 40 0 0 1 90 55" />
    <path className="g-fill" d="M10 55 A40 40 0 0 1 90 55" pathLength={100} strokeDasharray={`${level * 33.3} 100`} />
    <line className="g-needle" x1="50" y1="55" x2="50" y2="22" transform={`rotate(${angle} 50 55)`} />
    <circle className="g-hub" cx="50" cy="55" r="5" />
  </svg>;
}

const PRESET_VIEW: Record<Preset, { speed: number; quality: number; time: string }> = {
  fast: { speed: 3, quality: 1, time: 'Minutes' },
  balanced: { speed: 2, quality: 2, time: 'About 3× longer' },
  accurate: { speed: 1, quality: 3, time: 'Longest' },
};

function Meter({ icon, label, value }: { icon: IconName; label: string; value: number }) {
  return <span className="meter"><Icon name={icon} /><span>{label}</span>
    <span className="m-dots">{[1, 2, 3].map(dot => <i key={dot} className={dot <= value ? 'on' : ''} />)}</span></span>;
}

/** Part 3: choose speed vs quality with three picture cards. */
export function SpeedPicker({ preset, onChoose }: { preset: Preset; onChoose: (preset: Preset) => void }) {
  return <section className="train-part">
    <PartTitle n={3} icon="bolt" title="Pick a speed" />
    <div className="presets" role="radiogroup" aria-label="Training speed">
      {(Object.keys(PRESETS) as Preset[]).map(key => {
        const item = PRESETS[key];
        const view = PRESET_VIEW[key];
        return <label key={key} className="preset visual">
          <input type="radio" name="preset" checked={preset === key} onChange={() => onChoose(key)} />
          {key === 'balanced' && <span className="ribbon">Recommended</span>}
          <span className="tick"><Icon name="check" /></span>
          <Gauge level={view.speed} />
          <strong>{item.name}</strong>
          <Meter icon="clock" label="Speed" value={view.speed} />
          <Meter icon="target" label="Quality" value={view.quality} />
          <span className="best-for"><Icon name="lightbulb" /> {item.bestFor}</span>
        </label>;
      })}
    </div>
  </section>;
}

const RUN_PHASES: { icon: IconName; label: string }[] = [
  { icon: 'layers', label: 'Prepare' },
  { icon: 'refresh', label: 'Learn' },
  { icon: 'target', label: 'Check' },
  { icon: 'star', label: 'Ready' },
];

/** Training progress as four picture steps. `phase` 0–3; `done` marks all complete. */
export function PhaseSteps({ phase, done, active }: { phase: number; done: boolean; active: boolean }) {
  return <ol className="phase-steps" aria-label="Training steps">
    {RUN_PHASES.map((step, index) => {
      const state = done || index < phase ? 'done' : active && index === phase ? 'now' : '';
      return <li key={step.label} className={state} aria-current={state === 'now' ? 'step' : undefined}>
        <span className="ps-icon">{state === 'done' ? <Icon name="check" /> : <Icon name={step.icon} />}</span>
        <span>{step.label}</span>
      </li>;
    })}
  </ol>;
}
