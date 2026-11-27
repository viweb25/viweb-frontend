import type { ReactNode } from 'react';

import type { TrainingOptions } from '../../../services/api/trainingDatasets';
import { Icon, type IconName } from '../../../ui/Icon';
import { classColor } from '../../../ui/common';

/* ---------- Presets ---------- */

export type Preset = 'fast' | 'balanced' | 'accurate';

export const PRESETS: Record<Preset, {
  name: string; sub: string; icon: IconName;
  values: Partial<TrainingOptions>;
}> = {
  fast: {
    name: 'Quick trial', sub: 'Check that your photos and labels work.', icon: 'bolt',
    values: { epochs: 30, imgsz: 512, patience: 10, max_minutes: 60 },
  },
  balanced: {
    name: 'Standard', sub: 'Start here for a regular training run.', icon: 'target',
    values: { epochs: 100, imgsz: 640, patience: 20, max_minutes: 180 },
  },
  accurate: {
    name: 'More detail', sub: 'Use larger images for small details.', icon: 'star',
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
  for (const field of RUN_LIMITS) {
    const value = options[field.key];
    if (!Number.isInteger(value) || value < field.min || value > field.max) {
      return `${field.label} must be a whole number from ${field.min} to ${field.max}.`;
    }
  }
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

function Section({ icon, title, summary, children }: { icon: IconName; title: string; summary: string; children: ReactNode;
}) {
  return <details className="card adv-section">
    <summary><Icon name={icon} />{title}<small>{summary}</small></summary>
    <div className="adv-body">{children}</div>
  </details>;
}

const RUN_LIMITS = [
  n('epochs', 'Training passes', 1, 300, 1, 'One pass studies all training photos once.'),
  n('batch', 'Photos per batch', 1, 32, 1, 'Use fewer photos per batch if training runs out of memory.'),
  n('patience', 'Stop after passes without improvement', 1, 100, 1, 'Training can finish early when quality stops improving.'),
  n('max_minutes', 'Time limit (minutes)', 1, 240, 1, 'Training stops if it reaches this limit.'),
  n('validation_percent', 'Validation photos (%)', 5, 40, 1, 'These photos check progress during training.'),
  n('test_percent', 'Test photos (%)', 0, 40, 1, 'These photos are held back for the final score.'),
];

export function RunSettings({ options, set }: { options: TrainingOptions; set: SetOption }) {
  return <section className="card workspace-panel run-settings">
    <div><h2>Training settings</h2><p className="muted">Start with a preset, then adjust what matters for this run.</p></div>
    <label className="field">Model version name
      <input maxLength={80} placeholder="Box label check, first run" value={options.version_name}
        onChange={event => set('version_name', event.target.value)} />
    </label>
    <label className="field">Training notes
      <textarea maxLength={1000} rows={2} placeholder="Added photos of labels that cross the marked area."
        value={options.notes} onChange={event => set('notes', event.target.value)} />
    </label>
    <div className="fields">
      {RUN_LIMITS.map(field => <NumberInput field={field} options={options} set={set} key={field.key} />)}
      <label className="field">Training image size
        <select value={options.imgsz} onChange={event => set('imgsz', Number(event.target.value))}>
          {[320, 416, 512, 640, 768, 960, 1024].map(size => <option key={size} value={size}>{size} px</option>)}
        </select>
        <small>A larger image can help if the label covers very little of the photo.</small>
      </label>
      <label className="field">Model size
        <select value={options.model_size} onChange={event => set('model_size', event.target.value as TrainingOptions['model_size'])}>
          <option value="n">Nano</option><option value="s">Small</option><option value="m">Medium</option>
          <option value="l">Large</option><option value="x">Extra large</option>
        </select>
        <small>A larger model needs more time and memory.</small>
      </label>
    </div>
    <div className="fields run-adjustments">
      <label className="check"><input type="checkbox" checked={options.fliplr > 0}
        onChange={event => set('fliplr', event.target.checked ? 0.5 : 0)} /> Use mirrored photos during training</label>
      <label className="field">Brightness variety ({Math.round(options.hsv_v * 100)}%)
        <input type="range" min={0} max={1} step={.05} value={options.hsv_v}
          onChange={event => set('hsv_v', event.target.valueAsNumber)} />
        <small>Increase if real photos have a mix of brighter and darker lighting.</small>
      </label>
    </div>
    <details className="training-example">
      <summary>Example settings for a fixed camera</summary>
      <p className="small muted">For the box label check, start with photos of straight and crooked labels on different boxes. Keep some photos from another shift for testing. Keep the original left and right orientation and use mild brightness changes if the light varies.</p>
      <button type="button" className="btn ghost small" onClick={() => { set('fliplr', 0); set('hsv_v', .15); }}>
        Apply photo adjustments
      </button>
    </details>
  </section>;
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

    {labels.length > 0 && <div className="row">{labels.map((label, index) => <span className="chip plain" key={label}>
      <span className="swatch" style={{ background: classColor(index), width: 9, height: 9 }} />{label}</span>)}</div>}

    <Section icon="layers" title="Dataset" summary={`${train}/${options.validation_percent}/${options.test_percent} split`}>
      <div className="split-bar" aria-hidden="true">
        <span className="tr" style={{ width: `${Math.max(0, train)}%` }}>Study {train}%</span>
        <span className="va" style={{ width: `${options.validation_percent}%` }}>Check {options.validation_percent}%</span>
        {options.test_percent > 0 && <span className="te" style={{ width: `${options.test_percent}%` }}>Test {options.test_percent}%</span>}
      </div>
      {num([
        n('seed', 'Random seed', 0, 2147483647, 1, 'Same seed gives the same split'),
        n('min_box_px', 'Ignore boxes smaller than (px)', 0, 128, 1, 'Measured at the training image size'),
      ])}
      <p className="small muted"><Icon name="check" /> Duplicate photos are skipped on upload and unreadable images are reported before training. Every class is always kept in the training split.</p>
    </Section>

    <Section icon="cpu" title="Model" summary={`${options.model_size.toUpperCase()} size · ${options.imgsz}px`}>
      {num([n('freeze', 'Frozen layers', 0, 10, 1, 'Keep part of the starter model fixed')])}
      <label className="check"><input type="checkbox" checked={options.pretrained} onChange={event => set('pretrained', event.target.checked)} />
        Start from pretrained weights (recommended)</label>
    </Section>

    <Section icon="refresh" title="Training" summary={`${options.epochs} epochs · ${options.optimizer}`}>
      {num([
        n('lr0', 'Initial learning rate', .000001, .1, .0001),
        n('lrf', 'Final learning rate (fraction)', .000001, 1, .001),
        n('warmup_epochs', 'Warmup epochs', 0, 15, .5),
        n('momentum', 'Momentum', 0, .999, .001),
        n('weight_decay', 'Weight decay', 0, .1, .0001),
      ])}
      <div className="fields">
        <label className="field">Optimizer<select value={options.optimizer} onChange={event => set('optimizer', event.target.value as TrainingOptions['optimizer'])}>
          <option>SGD</option><option>Adam</option><option>AdamW</option></select></label>
        <label className="field">Learning rate schedule<select value={options.cos_lr ? 'cosine' : 'linear'} onChange={event => set('cos_lr', event.target.value === 'cosine')}>
          <option value="linear">Linear</option><option value="cosine">Cosine</option></select></label>
      </div>
    </Section>

    <Section icon="sliders" title="Loss weights" summary={`box ${options.box} · cls ${options.cls} · dfl ${options.dfl}`}>
      {num([
        n('box', 'Box loss', .01, 20, .1, 'How much box position matters'),
        n('cls', 'Classification loss', .01, 10, .1, 'Raise for many similar classes'),
        n('dfl', 'Distribution focal loss', .01, 10, .1),
      ])}
    </Section>

    <Section icon="wand" title="Augmentation" summary="Flips, color, mosaic and more">
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
        n('mosaic', 'Mosaic', 0, 1, .05),
        n('mixup', 'Mixup', 0, 1, .05),
        n('copy_paste', 'Copy-paste', 0, 1, .05),
        n('erasing', 'Random erasing (cutout)', 0, .9, .05),
        n('close_mosaic', 'Turn mosaic off in last N epochs', 0, 100, 1),
      ])}
    </Section>

    <Section icon="target" title="Validation thresholds" summary={`IoU ${options.iou} · max ${options.max_det}`}>
      {num([
        n('iou', 'NMS IoU threshold', .1, .95, .05, 'Overlap at which duplicate boxes merge'),
        n('max_det', 'Max detections per image', 1, 1000, 1),
      ])}
      <p className="small muted">Tracked metrics: precision, recall, mAP50 and mAP50–95. You choose the confidence threshold when testing.</p>
    </Section>


    <Section icon="save" title="Checkpoints and outputs" summary="Best and last .pt">
      {num([n('save_period', 'Also save every N epochs', 0, 100, 1, '0 saves only the best and last')])}
      <p className="small muted">Output: PyTorch weights (best.pt and last.pt) you can download in the Use step.</p>
    </Section>
  </section>;
}
