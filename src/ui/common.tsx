import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';

import { Icon } from './Icon';

/* ---------- Routing ---------- */

export const STEPS = ['upload', 'label', 'train', 'test', 'use'] as const;
export type Step = typeof STEPS[number];
export type Route =
  | { page: 'home' }
  | { page: 'guide' }
  | { page: 'programs' }
  | { page: 'program'; id: string }
  | { page: 'results'; run?: string }
  | { page: 'inspect' }
  | { page: 'team' }
  | { page: 'module'; key: string }
  | { page: 'project'; org: string; dataset: string; step: Step };

/** Pages shown inside the app shell with the module sidebar. */
export type ShellPage = Exclude<Route['page'], 'project'>;

export function parseRoute(hash = window.location.hash): Route {
  const parts = hash.replace(/^#\/?/, '').split('?')[0].split('/').filter(Boolean).map(decodeURIComponent);
  if (parts[0] === 'projects' && parts[1] && parts[2]) {
    const step = (STEPS as readonly string[]).includes(parts[3]) ? parts[3] as Step : 'upload';
    return { page: 'project', org: parts[1], dataset: parts[2], step };
  }
  if (parts[0] === 'programs') return parts[1] ? { page: 'program', id: parts[1] } : { page: 'programs' };
  if (parts[0] === 'results') return parts[1] ? { page: 'results', run: parts[1] } : { page: 'results' };
  if (parts[0] === 'modules' && parts[1]) return { page: 'module', key: parts[1] };
  if (parts[0] === 'guide') return { page: 'guide' };
  if (parts[0] === 'inspect') return { page: 'inspect' };
  if (parts[0] === 'team') return { page: 'team' };
  return { page: 'home' };
}

export function projectHref(org: string, dataset: string, step: Step = 'upload') {
  return `#/projects/${encodeURIComponent(org)}/${encodeURIComponent(dataset)}/${step}`;
}

export function useRoute() {
  const [route, setRoute] = useState(parseRoute);
  useEffect(() => {
    const update = () => setRoute(parseRoute());
    window.addEventListener('hashchange', update);
    return () => window.removeEventListener('hashchange', update);
  }, []);
  return route;
}

/* ---------- Class colors (data colors for boxes) ---------- */

const CLASS_COLORS = ['#fb923c', '#60a5fa', '#4ade80', '#f472b6', '#c084fc', '#22d3ee', '#facc15', '#f87171', '#818cf8', '#a3e635'];

export function classColor(index: number) {
  return CLASS_COLORS[((index % CLASS_COLORS.length) + CLASS_COLORS.length) % CLASS_COLORS.length];
}

export function colorFor(labels: string[], label: string) {
  return classColor(Math.max(0, labels.indexOf(label)));
}

/* ---------- Formatting ---------- */

export function initials(text: string) {
  const words = text.replace(/@.*/, '').split(/[\s._-]+/).filter(Boolean);
  return (words.length > 1 ? words[0][0] + words[1][0] : (words[0] ?? '?').slice(0, 2)).toUpperCase();
}

export function timeAgo(value: string | Date) {
  const seconds = Math.round((Date.now() - new Date(value).getTime()) / 1000);
  if (seconds < 60) return 'just now';
  const units: [number, string][] = [[60, 'minute'], [3600, 'hour'], [86400, 'day'], [604800, 'week'], [2592000, 'month']];
  let chosen = units[0];
  for (const unit of units) if (seconds >= unit[0]) chosen = unit;
  const amount = Math.floor(seconds / chosen[0]);
  return `${amount} ${chosen[1]}${amount === 1 ? '' : 's'} ago`;
}

export function percent(value: number | null | undefined, digits = 0) {
  return value === null || value === undefined ? '—' : `${(value * 100).toFixed(digits)}%`;
}

export function errorText(cause: unknown, fallback: string) {
  return cause instanceof Error && cause.message ? cause.message : fallback;
}

/* ---------- Quality bands ---------- */

export const QUALITY = ['Low', 'OK', 'Good', 'Great'] as const;

/** Map a mAP50-95 score to a plain-language band. */
export function qualityBand(score: number) {
  if (score >= .65) return 3;
  if (score >= .45) return 2;
  if (score >= .25) return 1;
  return 0;
}

/** Marker position (0-100) within the four equal-width bands. */
export function qualityPosition(score: number) {
  const edges = [0, .25, .45, .65, 1];
  const band = qualityBand(score);
  const within = (Math.min(score, 1) - edges[band]) / (edges[band + 1] - edges[band]);
  return Math.max(2, Math.min(98, (band + within) * 25));
}

/* ---------- Components ---------- */

export function Loading({ label = 'Loading…' }: { label?: string }) {
  return <div className="loading" role="status"><span className="spinner" aria-hidden="true" />{label}</div>;
}

export function ErrorBox({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return <div className="alert" role="alert">
    <Icon name="alert" />
    <div className="spacer">{message}</div>
    {onRetry && <button type="button" className="btn ghost small" onClick={onRetry}>Try again</button>}
  </div>;
}

export function Modal({ title, description, onClose, children, footer, wide }: {
  title: string;
  description?: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const close = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', close);
    const focusable = ref.current?.querySelector<HTMLElement>('input, select, textarea, button:not(.icon-btn)');
    focusable?.focus();
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', close);
      document.body.style.overflow = '';
      previous?.focus();
    };
  }, [onClose]);
  return <div className="modal-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
    <div className="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title" ref={ref}
      style={wide ? { width: 'min(100%, 860px)' } : undefined}>
      <header>
        <div><h2 id="modal-title">{title}</h2>{description && <p>{description}</p>}</div>
        <button type="button" className="icon-btn" aria-label="Close" onClick={onClose}><Icon name="close" /></button>
      </header>
      <div className="modal-body">{children}</div>
      {footer && <footer>{footer}</footer>}
    </div>
  </div>;
}

const ToastContext = createContext<(message: string) => void>(() => undefined);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [message, setMessage] = useState('');
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const show = useCallback((text: string) => {
    setMessage(text);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setMessage(''), 3200);
  }, []);
  return <ToastContext.Provider value={show}>
    {children}
    {message && <div className="toast" role="status"><Icon name="check" />{message}</div>}
  </ToastContext.Provider>;
}

export function useToast() {
  return useContext(ToastContext);
}

export function useObjectUrl(blob: Blob | undefined | null) {
  const [url, setUrl] = useState('');
  useEffect(() => {
    if (!blob) {
      setUrl('');
      return;
    }
    const next = URL.createObjectURL(blob);
    setUrl(next);
    return () => URL.revokeObjectURL(next);
  }, [blob]);
  return url;
}

/* ---------- Class kinds ---------- */

export const KIND_LABEL = { good: 'Good', defect: 'Defect', object: 'Object' } as const;

/** Decide PASS/FAIL from detections when the project marks classes as good or defect. */
export function kindVerdict(found: Record<string, number>, kindOf: (label: string) => 'good' | 'defect' | 'object') {
  const labels = Object.keys(found).filter(label => found[label] > 0);
  if (labels.some(label => kindOf(label) === 'defect')) return 'FAIL' as const;
  if (labels.some(label => kindOf(label) === 'good')) return 'PASS' as const;
  return null;
}
