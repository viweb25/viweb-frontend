import type { ReactNode } from 'react';

import type { TrainingOptions } from '../../../services/api/trainingDatasets';
import { Icon, type IconName } from '../../../ui/Icon';
import { classColor } from '../../../ui/common';

/* ---------- Presets ---------- */

export type Preset = 'fast' | 'balanced' | 'accurate';

export const PRESETS: Record<Preset, {
  name: string; sub: string; time: string; accuracy: number; accuracyLabel: string; icon: IconName; bestFor: string;
  values: Partial<TrainingOptions>;
}> = {
  fast: {
    name: 'Fast', sub: 'Quick first result', time: 'Shortest run', accuracy: 1, accuracyLabel: 'Good', icon: 'bolt',
    bestFor: 'A first try',
    values: { epochs: 30, imgsz: 512, patience: 10, max_minutes: 60 },
  },
  balanced: {
    name: 'Balanced', sub: 'Best for most projects', time: 'About 3× Fast', accuracy: 2, accuracyLabel: 'Better', icon: 'target',
    bestFor: 'Most projects',
    values: { epochs: 100, imgsz: 640, patience: 20, max_minutes: 180 },
  },
  accurate: {
    name: 'Best', sub: 'Takes longer, finds more', time: 'About 3× Balanced', accuracy: 3, accuracyLabel: 'Best', icon: 'star',
    bestFor: 'Small parts, final model',
    values: { epochs: 200, imgsz: 768, patience: 40, max_minutes: 240, cos_lr: true },
  },
};

const BASE: TrainingOptions = {
  version_name: '', notes: '', preset: 'balanced', model_size: 'n', pretrained: true, optimizer: 'SGD', cos_lr: false,
  validation_percent: 20, test_percent: 10, min_box_px: 0, seed: 0,
  epochs: 100, batch: 16, imgsz: 640, freeze: 0, lr0: .01, lrf: .01, warmup_epochs: 3, momentum: .937, weight_decay: .0005, patience: 20,
  box: 7.5, cls: .5, dfl: 1.5,
  degrees: 0, translate: .1, scale: .5, shear: 0, perspective: 0, hsv_h: .015, hsv_s: .7, hsv_v: .4,
  fliplr: .5, flipud: 0, mosaic: 1, mixup: 0, copy_paste: 0, erasing: .4, close_mosaic: 10,
  iou: .7, max_det: 300, save_period: 0, max_minutes: 180,
};

export function optionsFor(preset: Preset): TrainingOptions {
  return { ...BASE, ...PRESETS[preset].values, preset };
}

/** True when the options differ from the preset (ignoring name and notes). */
export function isCustomized(options: TrainingOptions, preset: Preset) {
  const strip = (value: TrainingOptions) => JSON.stringify({ ...value, version_name: '', notes: '', preset: '' });
  return strip(options) !== strip(optionsFor(preset));
}

/** A readable problem with the options, or '' when they can be sent. */
export function optionsProblem(options: TrainingOptions) {
  if (options.validation_percent + options.test_percent > 50) {
    return 'Keep at least half of your photos for training: lower the validation or test share.';
  }
  const empty = (Object.keys(options) as (keyof TrainingOptions)[])
    .some(key => typeof options[key] === 'number' && !Number.isFinite(options[key]));
  return empty ? 'One of the advanced settings is empty. Fill it in or reset to the preset.' : '';
}

/* ---------- Form pieces ---------- */

type NumKey = { [K in keyof TrainingOptions]: TrainingOptions[K] extends number ? K : never }[keyof TrainingOptions];
type NumField = { key: NumKey; label: string; min: number; max: number; step: number; hint?: string };
type SetOption = <K extends keyof TrainingOptions>(key: K, value: TrainingOptions[K]) => void;

const n = (key: NumKey, label: string, min: number, max: number, step: number, hint?: string): NumField => ({ key, label, min, max, step, hint });

function NumberInput({ field, options, set }: { field: NumField; options: TrainingOptions; set: SetOption }) {
  return <label className="field">{field.label}
    <input type="number" min={field.min} max={field.max} step={field.step}
      value={Number.isNaN(options[field.key]) ? '' : options[field.key]}
      onChange={event => set(field.key, event.target.valueAsNumber)} />
    {field.hint && <small>{field.hint}</small>}
  </label>;
}

function Section({ num, icon, title, summary, children, open }: {
  num: number; icon: IconName; title: string; summary: string; children: ReactNode; open?: boolean;
}) {
  return <details className="card adv-section" open={open}>
    <summary><span className="num">{num}</span><Icon name={icon} />{title}<small>{summary}</small></summary>
    <div className="adv-body">{children}</div>
  </details>;
}

/* ---------- Advanced settings ---------- */

export function AdvancedSettings({ options, set, labels, customized, onReset }: {
  options: TrainingOptions;
  set: SetOption;
  labels: string[];
  customized: boolean;
  onReset: () => void;
}) {
  const num = (fields: NumField[]) => <div className="fields">{fields.map(field =>
    <NumberInput key={field.key} field={field} options={options} set={set} />)}</div>;
  const train = 100 - (options.validation_percent || 0) - (options.test_percent || 0);

  return <section className="advanced" aria-label="Advanced settings">
    <div className="row">
      <p className="muted spacer"><Icon name="sliders" /> These settings are for experts. The preset values work well for most projects.</p>
      {customized && <span className="chip">Customized</span>}
      <button type="button" className="btn ghost small" onClick={onReset} disabled={!customized}><Icon name="undo" /> Reset to preset</button>
    </div>

    <Section num={1} icon="flag" title="Project" summary="Version name and notes" open>
      <div className="fields">
        <label className="field">Version name<input maxLength={80} placeholder="e.g. v2 with night shots" value={options.version_name}
          onChange={event => set('version_name', event.target.value)} /></label>
        <label className="field">Task<input value="Object detection (boxes)" disabled /></label>
      </div>
      <label className="field">Run notes<textarea maxLength={1000} rows={2} value={options.notes} placeholder="What changed in this run?"
        onChange={event => set('notes', event.target.value)} /></label>
      <div className="row">{labels.map((label, index) => <span className="chip plain" key={label}>
        <span className="swatch" style={{ background: classColor(index), width: 9, height: 9 }} />{label}</span>)}</div>
    </Section>

    <Section num={2} icon="layers" title="Dataset" summary={`${train}/${options.validation_percent}/${options.test_percent} split`}>
      <div className="split-bar" aria-hidden="true">
        <span className="tr" style={{ width: `${Math.max(0, train)}%` }}>Study {train}%</span>
        <span className="va" style={{ width: `${options.validation_percent}%` }}>Check {options.validation_percent}%</span>
        {options.test_percent > 0 && <span className="te" style={{ width: `${options.test_percent}%` }}>Test {options.test_percent}%</span>}
      </div>
      {num([
        n('validation_percent', 'Validation share (%)', 5, 40, 1, 'Checked during training'),
        n('test_percent', 'Test share (%)', 0, 40, 1, 'Held back for a final score'),
        n('seed', 'Random seed', 0, 2147483647, 1, 'Same seed gives the same split'),
        n('min_box_px', 'Ignore boxes smaller than (px)', 0, 128, 1, 'Measured at the training image size'),
      ])}
      <p className="small muted"><Icon name="check" /> Duplicate photos are skipped on upload and unreadable images are reported before training. Every class is always kept in the training split.</p>
    </Section>

    <Section num={3} icon="cpu" title="Model" summary={`${options.model_size.toUpperCase()} size · ${options.imgsz}px`}>
      <div className="field"><span>Model size</span>
        <div className="choice-grid">{([['n', 'Nano', 'Fastest, smallest'], ['s', 'Small', 'Good balance'], ['m', 'Medium', 'More accurate'], ['l', 'Large', 'Slow on CPU'], ['x', 'XL', 'Slowest']] as const)
          .map(([value, label, hint]) => <button type="button" key={value} className="choice" aria-pressed={options.model_size === value}
            onClick={() => set('model_size', value)}><strong>{label}</strong><small>{hint}</small></button>)}</div>
        <small>Bigger models are slower but can be more accurate.</small>
      </div>
      <div className="fields">
        <label className="field">Input image size<select value={options.imgsz} onChange={event => set('imgsz', Number(event.target.value))}>
          {[320, 416, 512, 640, 768, 960, 1024].map(size => <option key={size} value={size}>{size} px</option>)}
        </select><small>Larger finds small objects but trains slower</small></label>
        {num([n('freeze', 'Frozen layers', 0, 10, 1, 'Freeze the backbone for tiny datasets')])}
      </div>
      <label className="check"><input type="checkbox" checked={options.pretrained} onChange={event => set('pretrained', event.target.checked)} />
        Start from pretrained weights (recommended)</label>
    </Section>

    <Section num={4} icon="refresh" title="Training" summary={`${options.epochs} epochs · ${options.optimizer}`}>
      {num([
        n('epochs', 'Epochs', 1, 300, 1, 'Passes over your photos'),
        n('batch', 'Batch size', 1, 32, 1),
        n('lr0', 'Initial learning rate', .000001, .1, .0001),
        n('lrf', 'Final learning rate (fraction)', .000001, 1, .001),
        n('warmup_epochs', 'Warmup epochs', 0, 15, .5),
        n('momentum', 'Momentum', 0, .999, .001),
        n('weight_decay', 'Weight decay', 0, .1, .0001),
        n('patience', 'Early-stop patience', 1, 100, 1, 'Stop when no progress for this many epochs'),
      ])}
      <div className="fields">
        <label className="field">Optimizer<select value={options.optimizer} onChange={event => set('optimizer', event.target.value as TrainingOptions['optimizer'])}>
          <option>SGD</option><option>Adam</option><option>AdamW</option></select></label>
        <label className="field">Learning rate schedule<select value={options.cos_lr ? 'cosine' : 'linear'} onChange={event => set('cos_lr', event.target.value === 'cosine')}>
          <option value="linear">Linear</option><option value="cosine">Cosine</option></select></label>
      </div>
    </Section>

    <Section num={5} icon="sliders" title="Loss weights" summary={`box ${options.box} · cls ${options.cls} · dfl ${options.dfl}`}>
      {num([
        n('box', 'Box loss', .01, 20, .1, 'How much box position matters'),
        n('cls', 'Classification loss', .01, 10, .1, 'Raise for many similar classes'),
        n('dfl', 'Distribution focal loss', .01, 10, .1),
      ])}
    </Section>

    <Section num={6} icon="wand" title="Augmentation" summary="Flips, color, mosaic and more">
      <p className="small muted">Augmentation makes changed copies of your photos while training (flipped, brighter, shifted) so the model copes with real-world variation.</p>
      {num([
        n('fliplr', 'Horizontal flip (probability)', 0, 1, .05),
        n('flipud', 'Vertical flip (probability)', 0, 1, .05),
        n('degrees', 'Rotation (degrees)', 0, 90, 1),
        n('translate', 'Translate', 0, .5, .05),
        n('scale', 'Scale', 0, 1, .05),
        n('shear', 'Shear (degrees)', 0, 30, 1),
        n('perspective', 'Perspective', 0, .001, .0001),
        n('hsv_h', 'Hue', 0, .5, .005),
        n('hsv_s', 'Saturation', 0, 1, .05),
        n('hsv_v', 'Brightness', 0, 1, .05),
        n('mosaic', 'Mosaic', 0, 1, .05),
        n('mixup', 'Mixup', 0, 1, .05),
        n('copy_paste', 'Copy-paste', 0, 1, .05),
        n('erasing', 'Random erasing (cutout)', 0, .9, .05),
        n('close_mosaic', 'Turn mosaic off in last N epochs', 0, 100, 1),
      ])}
    </Section>

    <Section num={7} icon="target" title="Validation thresholds" summary={`IoU ${options.iou} · max ${options.max_det}`}>
      {num([
        n('iou', 'NMS IoU threshold', .1, .95, .05, 'Overlap at which duplicate boxes merge'),
        n('max_det', 'Max detections per image', 1, 1000, 1),
      ])}
      <p className="small muted">Tracked metrics: precision, recall, mAP50 and mAP50–95. You choose the confidence threshold when testing.</p>
    </Section>

    <Section num={8} icon="clock" title="Hardware and runtime" summary={`Up to ${options.max_minutes} min`}>
      {num([n('max_minutes', 'Time limit (minutes)', 1, 240, 1, 'Training stops with an error when this is reached')])}
      <p className="small muted"><Icon name="cpu" /> Runs on your workspace’s training worker (CPU).</p>
    </Section>

    <Section num={9} icon="save" title="Checkpoints and outputs" summary="Best and last .pt">
      {num([n('save_period', 'Also save every N epochs', 0, 100, 1, '0 saves only the best and last')])}
      <p className="small muted">Output: PyTorch weights (best.pt and last.pt) you can download in the Use step.</p>
    </Section>
  </section>;
}
