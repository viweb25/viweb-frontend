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
    <h2>Your photos</h2>
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

export function SpeedPicker({ preset, onChoose }: { preset: Preset; onChoose: (preset: Preset) => void }) {
  return <section className="train-part preset-picker">
    <h2>Training preset</h2>
    <div className="presets" role="radiogroup" aria-label="Training preset">
      {(Object.keys(PRESETS) as Preset[]).map(key => {
        const item = PRESETS[key];
        return <label key={key} className="preset-option">
          <input type="radio" name="preset" checked={preset === key} onChange={() => onChoose(key)} />
          <span className="workspace-icon"><Icon name={item.icon} /></span>
          <strong>{item.name}</strong>
          <small>{item.sub}</small>
          <span className="small muted">{item.values.epochs} passes · {item.values.imgsz} px</span>
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
