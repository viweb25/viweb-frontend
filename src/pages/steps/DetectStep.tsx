import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';

import type { ClassKind } from '../../services/api/trainingDatasets';
import { Icon, type IconName } from '../../ui/Icon';
import { BoxExamples } from '../../ui/Illustrations';
import { colorFor, projectHref } from '../../ui/common';
import type { ClassEdit, Project } from '../project/useProject';

/**
 * Step 1 of a project, "Set up". Five short sections, one per screen:
 * project → names → good or bad (one name per screen) → PASS / FAIL rule → how to draw boxes.
 */
type Screen = 'project' | 'name' | 'kind' | 'rule' | 'boxes';

const SCREENS: { key: Screen; icon: IconName; label: string }[] = [
  { key: 'project', icon: 'layers', label: 'Project' },
  { key: 'name', icon: 'tag', label: 'Names' },
  { key: 'kind', icon: 'check', label: 'Good or bad' },
  { key: 'rule', icon: 'flag', label: 'Rule' },
  { key: 'boxes', icon: 'box', label: 'Boxes' },
];

/* ---------- Teaching content ---------- */

const PROJECT_NAMES = ['PCB-200 top side', 'Bottle cap · Line 2', 'Gearbox cover screws', 'Label on carton'];
const CHECK_NOTES = [
  'Every screw is in place and fully tightened.',
  'All capacitors are present and there is no solder bridge.',
  'The cap is closed and straight on every bottle.',
];

const KINDS: { kind: ClassKind; title: string; result: string; example: string; hint: string }[] = [
  { kind: 'good', title: 'Good', result: 'Means PASS', example: 'e.g. screw_ok, cap_closed', hint: 'e.g. screw head flat, fully in' },
  { kind: 'defect', title: 'Bad', result: 'Means FAIL', example: 'e.g. scratch, screw_missing', hint: 'e.g. empty hole, no screw' },
  { kind: 'object', title: 'Just count', result: 'No pass or fail', example: 'e.g. bolt, label, carton', hint: 'e.g. any bolt, any size' },
];

const EXAMPLE_SETS: { title: string; icon: IconName; rows: ClassEdit[] }[] = [
  {
    title: 'Screws on a plate', icon: 'cpu', rows: [
      { name: 'screw_ok', kind: 'good', hint: 'Head flat and fully in' },
      { name: 'screw_missing', kind: 'defect', hint: 'Empty hole' },
      { name: 'screw_loose', kind: 'defect', hint: 'Head raised or tilted' },
    ],
  },
  {
    title: 'Circuit board', icon: 'grid', rows: [
      { name: 'capacitor_ok', kind: 'good', hint: 'Capacitor in its place' },
      { name: 'capacitor_missing', kind: 'defect', hint: 'Empty pads' },
      { name: 'solder_bridge', kind: 'defect', hint: 'Solder joins two pins' },
    ],
  },
  {
    title: 'Bottle caps', icon: 'target', rows: [
      { name: 'cap_ok', kind: 'good', hint: 'Closed and straight' },
      { name: 'cap_crooked', kind: 'defect', hint: 'Tilted cap' },
      { name: 'cap_missing', kind: 'defect', hint: 'Open bottle' },
    ],
  },
  { title: 'Count parts only', icon: 'box', rows: [{ name: 'part', kind: 'object', hint: 'Any part to count' }] },
];

const GOOD_NAMES = ['screw_ok', 'screw_missing', 'scratch', 'cap_crooked'];
const BAD_NAMES: { name: string; why: string }[] = [
  { name: 'Screw OK!!', why: 'spaces, capitals, signs' },
  { name: 'bad', why: 'bad what?' },
  { name: 'thing1', why: 'says nothing' },
];

const GENERIC = /^(bad|good|thing|object|item|part|defect|ok|ng|error|class)\d*$/;

/** A friendly tip about a name, or '' when it is a good name. Never blocks. */
function nameAdvice(name: string) {
  if (!name) return '';
  if (/\s/.test(name)) return `Use _ instead of spaces: ${name.trim().toLowerCase().replace(/\s+/g, '_')}`;
  if (name !== name.toLowerCase()) return `Use small letters: ${name.toLowerCase()}`;
  if (/[^a-z0-9_-]/.test(name)) return 'Use only letters, numbers and _';
  if (GENERIC.test(name)) return 'Too general. Say which part, e.g. screw_missing';
  return '';
}

function clean(value: string) {
  return value.trim().slice(0, 80);
}

/* ---------- Step ---------- */

export function DetectStep({ project, orgId, datasetId }: { project: Project; orgId: string; datasetId: string }) {
  const { canEdit } = project;
  const [rows, setRows] = useState<ClassEdit[]>(() => project.labels.map(label => ({
    original: label, name: label, kind: project.kindOf(label), hint: project.classInfo[label]?.hint ?? '',
  })));
  /** Names whose good/bad question is answered (saved before, picked now, or set by an example). */
  const [answered, setAnswered] = useState<Set<string>>(() => new Set(project.labels.filter(label => project.classInfo[label])));
  const [screen, setScreen] = useState<Screen>(() =>
    !project.labels.length ? 'project' : project.labels.every(label => project.classInfo[label]) || !canEdit ? 'rule' : 'kind');
  const [kindIndex, setKindIndex] = useState(() => Math.max(0, project.labels.findIndex(label => !project.classInfo[label])));
  const [error, setError] = useState('');

  useEffect(() => { window.scrollTo(0, 0); }, [screen, kindIndex]);

  /** Save names and answers together, so a half-answered list never looks finished. */
  function apply(next = rows) {
    const problem = project.applyClasses(next);
    if (problem) {
      setError(problem);
      return false;
    }
    setError('');
    setRows(next.map(row => ({ ...row, name: clean(row.name), original: clean(row.name) })));
    return true;
  }

  function goKinds(start = 0) {
    setError('');
    setKindIndex(start);
    setScreen('kind');
  }

  function pickKind(kind: ClassKind) {
    const next = rows.map((row, index) => index === kindIndex ? { ...row, kind } : row);
    setRows(next);
    setAnswered(current => new Set(current).add(clean(rows[kindIndex].name)));
    setTimeout(() => {
      if (kindIndex + 1 < next.length) setKindIndex(kindIndex + 1);
      else if (apply(next)) setScreen('rule');
    }, 250);
  }

  const current = SCREENS.findIndex(item => item.key === screen);
  const photosHref = projectHref(orgId, datasetId, 'upload');

  return <main className="page ds">
    <header className="ds-head">
      <span className="eyebrow"><Icon name="sliders" /> Step 1 of 6 · Set up</span>
      <ol className="ds-dots" aria-label="Sections">
        {SCREENS.map((item, index) => <li key={item.key} className={index < current ? 'past' : index === current ? 'on' : ''}
          aria-current={index === current ? 'step' : undefined}>
          <span>{index < current ? <Icon name="check" /> : <Icon name={item.icon} />}</span><em>{item.label}</em>
        </li>)}
      </ol>
    </header>

    {screen === 'project' && <ProjectScreen project={project} onNext={() => setScreen('name')} />}

    {screen === 'name' && <NameScreen rows={rows} setRows={setRows} project={project} canEdit={canEdit}
      onBack={() => setScreen('project')} onExample={set => {
        setRows(set.map(row => ({ ...row })));
        setAnswered(new Set(set.map(row => row.name)));
      }}
      onNext={() => goKinds(0)} error={error} />}

    {screen === 'kind' && rows[kindIndex] && <KindScreen row={rows[kindIndex]} index={kindIndex} total={rows.length}
      names={rows.map(row => row.name)} chosen={answered.has(clean(rows[kindIndex].name)) ? rows[kindIndex].kind : null}
      canEdit={canEdit} error={error} onPick={pickKind}
      onHint={hint => setRows(currentRows => currentRows.map((row, index) => index === kindIndex ? { ...row, hint } : row))}
      onBack={() => kindIndex ? setKindIndex(kindIndex - 1) : setScreen('name')}
      onNext={() => {
        if (kindIndex + 1 < rows.length) setKindIndex(kindIndex + 1);
        else if (apply()) setScreen('rule');
      }} />}

    {screen === 'rule' && <RuleScreen rows={rows} canEdit={canEdit}
      onNames={() => setScreen('name')} onKinds={() => goKinds(0)} onNext={() => setScreen('boxes')} />}

    {screen === 'boxes' && <BoxesScreen onBack={() => setScreen('rule')} nextHref={photosHref} />}
  </main>;
}

/* ---------- Shared layout: the question card plus a help column ---------- */

function Section({ icon, title, sub, children, help, nav }: {
  icon: IconName;
  title: ReactNode;
  sub?: ReactNode;
  children: ReactNode;
  help?: ReactNode;
  nav: ReactNode;
}) {
  return <div className={`ds-layout${help ? '' : ' single'}`}>
    <section className="card ds-card">
      <div className="ds-title">
        <span className="ds-title-icon"><Icon name={icon} /></span>
        <div><h1>{title}</h1>{sub && <p>{sub}</p>}</div>
      </div>
      {children}
      <div className="ds-nav">{nav}</div>
    </section>
    {help && <aside className="ds-help">{help}</aside>}
  </div>;
}

function HelpCard({ icon, title, children }: { icon: IconName; title: string; children: ReactNode }) {
  return <section className="card ds-help-card">
    <h3><Icon name={icon} /> {title}</h3>
    {children}
  </section>;
}

/* ---------- 1. Project ---------- */

function ProjectScreen({ project, onNext }: { project: Project; onNext: () => void }) {
  const { canEdit } = project;
  return <Section icon="layers" title="Name your project" sub="One project = one part, seen by one camera."
    help={<>
      <HelpCard icon="lightbulb" title="Good project names">
        <ul className="ds-eg-list">
          <li className="ok"><Icon name="check" /> PCB-200 top side</li>
          <li className="ok"><Icon name="check" /> Bottle cap · Line 2</li>
          <li className="bad"><Icon name="close" /> Test project</li>
          <li className="bad"><Icon name="close" /> New 1</li>
        </ul>
        <p className="small muted">Say the part, and the side or line if you have more than one.</p>
      </HelpCard>
      <HelpCard icon="camera" title="One view per project">
        <p className="small">Top and bottom of a board look different. Make two projects, one for each camera view.</p>
      </HelpCard>
    </>}
    nav={<><span /><button type="button" className="btn" disabled={!project.name.trim()} onClick={onNext}>Next: Names <Icon name="arrow" /></button></>}>
    <label className="field">
      <span>Project name</span>
      <input value={project.name} maxLength={80} disabled={!canEdit} placeholder="e.g. PCB-200 top side"
        onChange={event => project.setName(event.target.value)} />
    </label>
    {canEdit && <div className="ds-chips"><span className="small muted">Examples:</span>
      {PROJECT_NAMES.map(name => <button key={name} type="button" className="chip plain ds-chip" onClick={() => project.setName(name)}>{name}</button>)}
    </div>}

    <label className="field">
      <span>What do you check? <span className="muted">(optional)</span></span>
      <textarea value={project.note} maxLength={400} disabled={!canEdit} rows={3}
        placeholder="e.g. Every screw is in place and fully tightened."
        onChange={event => project.setNote(event.target.value)} />
      <small>{project.note.length}/400 · Helps your team understand the project.</small>
    </label>
    {canEdit && <div className="ds-chips"><span className="small muted">Examples:</span>
      {CHECK_NOTES.map(note => <button key={note} type="button" className="chip plain ds-chip" onClick={() => project.setNote(note)}>{note}</button>)}
    </div>}
  </Section>;
}

/* ---------- 2. Names ---------- */

function NameScreen({ rows, setRows, project, canEdit, onBack, onExample, onNext, error }: {
  rows: ClassEdit[];
  setRows: (update: (rows: ClassEdit[]) => ClassEdit[]) => void;
  project: Project;
  canEdit: boolean;
  onBack: () => void;
  onExample: (rows: ClassEdit[]) => void;
  onNext: () => void;
  error: string;
}) {
  const [text, setText] = useState('');
  const [problem, setProblem] = useState('');
  const input = useRef<HTMLInputElement>(null);
  const typed = clean(text);
  const advice = nameAdvice(typed);
  const names = rows.map(row => row.name);
  const hasBad = rows.some(row => row.kind === 'defect') || rows.length >= 2;

  function add(event: FormEvent) {
    event.preventDefault();
    if (!typed) return;
    if (rows.some(row => row.name.toLowerCase() === typed.toLowerCase())) {
      setProblem(`“${typed}” is already in the list.`);
      return;
    }
    setRows(current => [...current, { name: typed, kind: 'object', hint: '' }]);
    setText('');
    setProblem('');
    input.current?.focus();
  }

  function remove(index: number) {
    const row = rows[index];
    const used = row.original ? project.labelCounts[row.original] ?? 0 : 0;
    if (used && !window.confirm(`“${row.original}” is marked in ${used} ${used === 1 ? 'photo' : 'photos'}. Remove it and those boxes?`)) return;
    setRows(current => current.filter((_, item) => item !== index));
  }

  function rename(index: number, value: string) {
    setRows(current => current.map((row, item) => item === index ? { ...row, name: value } : row));
  }

  return <Section icon="tag" title="What should it find?"
    sub="Give each thing a short name. Add the good version and the bad versions."
    help={<>
      <HelpCard icon="lightbulb" title="How to name">
        <ol className="ds-rules">
          <li><b>part_state</b>: the thing, then how it is. <code>screw_ok</code>, <code>screw_missing</code></li>
          <li><b>small letters</b>, <b>_</b> instead of spaces.</li>
          <li><b>One name</b> for each thing that looks different.</li>
        </ol>
        <div className="ds-eg-cols">
          <ul className="ds-eg-list">{GOOD_NAMES.map(name => <li key={name} className="ok"><Icon name="check" /> <code>{name}</code></li>)}</ul>
          <ul className="ds-eg-list">{BAD_NAMES.map(item => <li key={item.name} className="bad"><Icon name="close" /> <code>{item.name}</code><small>{item.why}</small></li>)}</ul>
        </div>
      </HelpCard>
      <HelpCard icon="eye" title="Why name the bad ones too?">
        <PairArt />
        <p className="small">The model only knows what you name. Name <code>screw_missing</code> and it learns to see an empty hole.</p>
      </HelpCard>
    </>}
    nav={<>
      <button type="button" className="btn ghost" onClick={onBack}><Icon name="back" /> Back</button>
      <span className="small muted">{rows.length ? `${rows.length} ${rows.length === 1 ? 'name' : 'names'}` : 'No names yet'}</span>
      <button type="button" className="btn" disabled={!rows.length || !canEdit || rows.some(row => !clean(row.name))} onClick={onNext}>
        Next: Good or bad <Icon name="arrow" /></button>
    </>}>
    {canEdit && <form className="ds-add" onSubmit={add}>
      <input ref={input} className="input" value={text} maxLength={80} autoFocus aria-label="Name of a thing to find"
        placeholder="Type a name, e.g. screw_ok" onChange={event => { setText(event.target.value); setProblem(''); }} />
      <button type="submit" className="btn" disabled={!typed}><Icon name="plus" /> Add</button>
    </form>}
    {typed && <p className={`ds-advice ${advice ? 'warn' : 'ok'}`} role="status">
      <Icon name={advice ? 'lightbulb' : 'check'} /> {advice || 'Good name'}
    </p>}
    {problem && <p className="ds-advice warn" role="alert"><Icon name="info" /> {problem}</p>}

    {rows.length > 0 && <ul className="ds-names" aria-label="Names">
      {rows.map((row, index) => {
        const tip = nameAdvice(clean(row.name));
        return <li key={`${row.original ?? 'new'}:${index}`}>
          <span className="swatch" style={{ background: colorFor(names, row.name) }} />
          <input className="ds-name-input" value={row.name} maxLength={80} disabled={!canEdit} aria-label={`Name ${index + 1}`}
            onChange={event => rename(index, event.target.value)} />
          {tip && <span className="ds-row-tip" title={tip}><Icon name="lightbulb" /></span>}
          {canEdit && <button type="button" className="icon-btn" aria-label={`Remove ${row.name}`} onClick={() => remove(index)}>
            <Icon name="close" /></button>}
        </li>;
      })}
    </ul>}
    {rows.length === 1 && !hasBad && <p className="ds-advice warn"><Icon name="info" /> Only one name. Add a bad version too, so it can find problems.</p>}

    {canEdit && <div className="ds-sets">
      <h3>Or start from an example</h3>
      <div className="ds-set-grid">
        {EXAMPLE_SETS.map(set => <button key={set.title} type="button" className="ds-set" onClick={() => onExample(set.rows)}>
          <span className="ds-set-head"><span className="ds-set-icon"><Icon name={set.icon} /></span><strong>{set.title}</strong></span>
          <span className="ds-set-rows">{set.rows.map(row => <span key={row.name} className={`ds-set-row ${row.kind}`}>
            <KindDot kind={row.kind} /><code>{row.name}</code></span>)}</span>
          <span className="ds-set-use">Use this <Icon name="arrow" /></span>
        </button>)}
      </div>
    </div>}
    {error && <div className="alert" role="alert"><Icon name="alert" />{error}</div>}
  </Section>;
}

/* ---------- 3. Good or bad (one name per screen) ---------- */

function KindScreen({ row, index, total, names, chosen, canEdit, error, onPick, onHint, onBack, onNext }: {
  row: ClassEdit;
  index: number;
  total: number;
  names: string[];
  chosen: ClassKind | null;
  canEdit: boolean;
  error: string;
  onPick: (kind: ClassKind) => void;
  onHint: (hint: string) => void;
  onBack: () => void;
  onNext: () => void;
}) {
  const hintExample = KINDS.find(option => option.kind === (chosen ?? 'good'))!.hint;
  return <Section icon="check"
    title={<>Is <span className="ds-name" style={{ background: colorFor(names, row.name) }}>{row.name}</span> good or bad?</>}
    sub={`Name ${index + 1} of ${total}. Pick one.`}
    help={<>
      <HelpCard icon="flag" title="What happens on the line">
        <ul className="ds-eg-list">
          <li className="ok"><Icon name="check" /> <span><b>Good</b> found where expected → <b>PASS</b></span></li>
          <li className="bad"><Icon name="close" /> <span><b>Bad</b> found anywhere → <b>FAIL</b></span></li>
          <li><Icon name="box" /> <span><b>Just count</b> → counted, no verdict</span></li>
        </ul>
      </HelpCard>
      <HelpCard icon="lightbulb" title="Not sure?">
        <p className="small">Ask: <i>“If I see this on a board, do I throw the board away?”</i> Yes → <b>Bad</b>. No → <b>Good</b>.</p>
      </HelpCard>
    </>}
    nav={<>
      <button type="button" className="btn ghost" onClick={onBack}><Icon name="back" /> Back</button>
      <ol className="ds-mini-dots" aria-label={`Name ${index + 1} of ${total}`}>
        {Array.from({ length: total }, (_, position) => <li key={position} className={position < index ? 'past' : position === index ? 'on' : ''} />)}
      </ol>
      <button type="button" className="btn" disabled={!chosen} onClick={onNext}>
        {index + 1 < total ? 'Next name' : 'See the rule'} <Icon name="arrow" /></button>
    </>}>
    <div className="ds-kinds" role="radiogroup" aria-label={`Is ${row.name} good or bad?`}>
      {KINDS.map(option => <button key={option.kind} type="button" role="radio" aria-checked={chosen === option.kind}
        className={`ds-kind ${option.kind}${chosen === option.kind ? ' chosen' : ''}`} onClick={() => onPick(option.kind)} disabled={!canEdit}>
        <KindArt kind={option.kind} />
        <strong>{option.title}</strong>
        <span className="ds-kind-result">{option.result}</span>
        <small>{option.example}</small>
      </button>)}
    </div>
    <label className="field">
      <span><Icon name="eye" /> How does <b>{row.name}</b> look? <span className="muted">(optional, helps your team mark photos the same way)</span></span>
      <input value={row.hint} maxLength={120} disabled={!canEdit} placeholder={hintExample}
        onChange={event => onHint(event.target.value)} />
    </label>
    {error && <div className="alert" role="alert"><Icon name="alert" />{error}</div>}
  </Section>;
}

/* ---------- 4. The PASS / FAIL rule ---------- */

function RuleScreen({ rows, canEdit, onNames, onKinds, onNext }: {
  rows: ClassEdit[];
  canEdit: boolean;
  onNames: () => void;
  onKinds: () => void;
  onNext: () => void;
}) {
  const names = rows.map(row => row.name);
  const of = (kind: ClassKind) => rows.filter(row => row.kind === kind);
  const good = of('good');
  const bad = of('defect');
  const counted = of('object');
  const list = (items: ClassEdit[]) => items.length
    ? <ul className="ds-rule-list">{items.map(row => <li key={row.name}>
      <span className="swatch" style={{ background: colorFor(names, row.name) }} /><code>{row.name}</code>
      {row.hint && <small>{row.hint}</small>}</li>)}</ul>
    : <p className="muted small">None</p>;
  const goodName = good[0]?.name ?? counted[0]?.name ?? rows[0]?.name ?? 'part';
  const badName = bad[0]?.name;

  return <Section icon="flag" title="Your rule" sub="This is how every board will be judged."
    nav={<>
      {canEdit ? <span className="row">
        <button type="button" className="btn ghost small" onClick={onNames}><Icon name="tag" /> Change names</button>
        <button type="button" className="btn ghost small" onClick={onKinds}><Icon name="check" /> Change good / bad</button>
      </span> : <span />}
      <button type="button" className="btn" onClick={onNext}>Next: How to draw boxes <Icon name="arrow" /></button>
    </>}>
    <div className="ds-rule">
      <div className="ds-rule-col pass">
        <h2><KindArt kind="good" small /> PASS</h2>
        <p>when it finds</p>
        {list(good)}
      </div>
      <div className="ds-rule-col fail">
        <h2><KindArt kind="defect" small /> FAIL</h2>
        <p>if it finds any</p>
        {list(bad)}
      </div>
    </div>
    {counted.length > 0 && <p className="ds-counted"><Icon name="box" /> Only counted: {counted.map(row => row.name).join(', ')}</p>}
    {!bad.length && <div className="notice"><Icon name="info" />
      <span className="spacer">Nothing is marked bad, so a board can never FAIL.</span>
      {canEdit && <button type="button" className="btn ghost small" onClick={onKinds}>Mark something bad</button>}
    </div>}

    <h3 className="ds-sub-h"><Icon name="eye" /> Example with your names</h3>
    <div className="ds-boards">
      <ExampleBoard title="Board A" items={[goodName, goodName, goodName, goodName].map(label => ({ label, bad: false }))} pass names={names} />
      {badName ? <ExampleBoard title="Board B" items={[{ label: goodName, bad: false }, { label: goodName, bad: false }, { label: badName, bad: true }, { label: goodName, bad: false }]}
        pass={false} names={names} />
        : <div className="ds-board-empty"><Icon name="info" /> Mark a name as <b>Bad</b> to see a FAIL example.</div>}
    </div>
  </Section>;
}

/* ---------- 5. How to draw boxes ---------- */

function BoxesScreen({ onBack, nextHref }: { onBack: () => void; nextHref: string }) {
  const rules: { icon: IconName; title: string; text: string }[] = [
    { icon: 'box', title: 'Tight box', text: 'Touch the edges of the whole thing.' },
    { icon: 'grid', title: 'Every one', text: 'Four screws = four boxes.' },
    { icon: 'alert', title: 'Bad ones too', text: 'Box the scratch, the empty hole.' },
    { icon: 'close', title: 'Empty photo?', text: 'Press “Nothing here”. It still teaches.' },
  ];
  return <Section icon="box" title="How to draw boxes" sub="You will do this in the Mark step. Look at these first."
    nav={<>
      <button type="button" className="btn ghost" onClick={onBack}><Icon name="back" /> Back</button>
      <a className="btn" href={nextHref}>Done. Next: Add photos <Icon name="arrow" /></a>
    </>}>
    <ol className="ds-box-rules">
      {rules.map((rule, index) => <li key={rule.title}>
        <span className="ds-box-n">{index + 1}</span>
        <span className="ds-set-icon"><Icon name={rule.icon} /></span>
        <span><b>{rule.title}</b><small>{rule.text}</small></span>
      </li>)}
    </ol>
    <BoxExamples />
  </Section>;
}

/* ---------- Pictures ---------- */

/** Big picture for a kind: green tick, red cross, or a counted box. */
function KindArt({ kind, small }: { kind: ClassKind; small?: boolean }) {
  const size = small ? 28 : 64;
  return <svg className={`ds-art ${kind}`} width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
    <circle cx="32" cy="32" r="30" />
    {kind === 'good' && <path d="M19 33l9 9 17-19" />}
    {kind === 'defect' && <path d="M22 22l20 20M42 22 22 42" />}
    {kind === 'object' && <><rect x="18" y="18" width="28" height="28" rx="4" /><path d="M28 28h8v8h-8z" /></>}
  </svg>;
}

function KindDot({ kind }: { kind: ClassKind }) {
  return <span className={`ds-dot ${kind}`} aria-label={kind === 'good' ? 'good' : kind === 'defect' ? 'bad' : 'count'}>
    <Icon name={kind === 'good' ? 'check' : kind === 'defect' ? 'close' : 'box'} />
  </span>;
}

/** A screw in its hole (screw_ok) next to an empty hole (screw_missing). */
function PairArt() {
  return <svg className="ds-pair" viewBox="0 0 200 80" role="img" aria-label="screw_ok next to screw_missing">
    <rect className="ds-plate" x="2" y="2" width="196" height="76" rx="10" />
    <circle className="ds-hole" cx="55" cy="38" r="16" />
    <circle className="ds-screw" cx="55" cy="38" r="12" />
    <path className="ds-screw-slot" d="M47 38h16M55 30v16" />
    <rect className="ds-box-ok" x="35" y="18" width="40" height="40" rx="3" />
    <text x="55" y="72" textAnchor="middle">screw_ok</text>
    <circle className="ds-hole" cx="145" cy="38" r="16" />
    <circle className="ds-hole-in" cx="145" cy="38" r="8" />
    <rect className="ds-box-bad" x="125" y="18" width="40" height="40" rx="3" />
    <text x="145" y="72" textAnchor="middle">screw_missing</text>
  </svg>;
}

/** A small board with four boxed items and its verdict, using the project's own names. */
function ExampleBoard({ title, items, pass, names }: { title: string; items: { label: string; bad: boolean }[]; pass: boolean; names: string[] }) {
  return <figure className={`ds-board ${pass ? 'pass' : 'fail'}`}>
    <svg viewBox="0 0 220 120" role="img" aria-label={`${title}: ${items.map(item => item.label).join(', ')}. ${pass ? 'PASS' : 'FAIL'}`}>
      <rect className="ds-plate" x="2" y="2" width="216" height="116" rx="10" />
      {items.map((item, position) => {
        const x = 30 + position * 53;
        return <g key={position}>
          {item.bad
            ? <path className="ds-scratch" d={`M${x - 10} ${48} l8 6 l-3 6 l12 6`} />
            : <><circle className="ds-screw" cx={x} cy={58} r={11} /><path className="ds-screw-slot" d={`M${x - 7} 58h14`} /></>}
          <rect className={item.bad ? 'ds-box-bad' : 'ds-box-ok'} x={x - 18} y={38} width={36} height={40} rx="3"
            style={item.bad ? undefined : { stroke: colorFor(names, item.label) }} />
          <text x={x} y={96} textAnchor="middle">{item.label.length > 9 ? `${item.label.slice(0, 8)}…` : item.label}</text>
        </g>;
      })}
    </svg>
    <figcaption>
      <span>{title}</span>
      <span className={`ds-verdict ${pass ? 'pass' : 'fail'}`}><Icon name={pass ? 'check' : 'close'} /> {pass ? 'PASS' : 'FAIL'}</span>
    </figcaption>
  </figure>;
}
