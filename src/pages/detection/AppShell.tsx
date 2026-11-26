import { useEffect, useState, type ReactNode } from 'react';

import { Topbar } from '../../App';
import { listRuns } from '../../services/api/inspectionPrograms';
import { listModules, type ProductModule } from '../../services/api/modules';
import { Icon, type IconName } from '../../ui/Icon';
import type { ShellPage } from '../../ui/common';

/** Where each object-detection section lives. */
const SECTION_HREF: Record<string, { href: string; pages: ShellPage[] }> = {
  guide: { href: '#/guide', pages: ['guide'] },
  projects: { href: '#/projects', pages: ['projects'] },
  programs: { href: '#/programs', pages: ['programs', 'program'] },
  results: { href: '#/results', pages: ['results'] },
  inspect: { href: '#/inspect', pages: ['inspect'] },
};

/** Used until the API answers, and if it cannot be reached. */
const FALLBACK: ProductModule[] = [{
  key: 'object-detection', name: 'Object detection', summary: '', icon: 'target', status: 'available', highlights: [],
  sections: [
    { key: 'guide', name: 'Getting started', icon: 'help' },
    { key: 'projects', name: 'Projects', icon: 'grid' },
    { key: 'programs', name: 'Inspection programs', icon: 'layers' },
    { key: 'results', name: 'Results and review', icon: 'flag' },
    { key: 'inspect', name: 'Quick check', icon: 'inspect' },
  ],
}];

let cachedModules: ProductModule[] | null = null;

export function useModules() {
  const [modules, setModules] = useState<ProductModule[]>(cachedModules ?? FALLBACK);
  useEffect(() => {
    if (cachedModules) return;
    const controller = new AbortController();
    listModules(controller.signal).then(result => { cachedModules = result; setModules(result); }).catch(() => undefined);
    return () => controller.abort();
  }, []);
  return modules;
}

function usePendingReviews(orgId: string, page: ShellPage) {
  const [count, setCount] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    listRuns(orgId, { reviewStatus: 'pending', limit: 200 }, controller.signal)
      .then(runs => setCount(runs.length)).catch(() => undefined);
    return () => controller.abort();
  }, [orgId, page]);
  return count;
}

const OPEN_KEY = 'vision-studio.menu-open';

/** Which module groups are expanded. Remembered per browser; every group starts open. */
function useOpenGroups(): [Record<string, boolean>, (key: string, value: boolean) => void] {
  const [open, setOpen] = useState<Record<string, boolean>>(() => {
    try { return JSON.parse(localStorage.getItem(OPEN_KEY) ?? '{}'); } catch { return {}; }
  });
  function toggle(key: string, value: boolean) {
    setOpen(current => {
      const next = { ...current, [key]: value };
      try { localStorage.setItem(OPEN_KEY, JSON.stringify(next)); } catch { /* optional */ }
      return next;
    });
  }
  return [open, toggle];
}

function asIcon(name: string): IconName {
  return name as IconName;
}

/** Topbar + left module menu around every page except the project studio. */
export function AppShell({ page, moduleKey, orgId, children }: {
  page: ShellPage;
  moduleKey?: string;
  orgId: string;
  children: ReactNode;
}) {
  const modules = useModules();
  const pending = usePendingReviews(orgId, page);
  const [open, toggle] = useOpenGroups();
  return <>
    <Topbar />
    <div className="shell">
      <nav className="sidebar" aria-label="Modules">
        <a href="#/" className="side-module side-home" aria-current={page === 'home' ? 'page' : undefined}>
          <span className="side-icon"><Icon name="home" /></span><span className="spacer">Home</span>
        </a>
        {modules.map(module => {
          const available = module.status === 'available';
          if (!available) {
            return <a key={module.key} href={`#/modules/${module.key}`} className="side-module soon"
              aria-current={moduleKey === module.key ? 'page' : undefined}>
              <span className="side-icon"><Icon name={asIcon(module.icon)} /></span>
              <span className="spacer">{module.name}</span>
              <span className="soon-pill">Soon</span>
            </a>;
          }
          const here = module.sections.some(section => SECTION_HREF[section.key]?.pages.includes(page));
          const expanded = open[module.key] ?? true;
          return <div key={module.key} className={`side-group${expanded ? ' expanded' : ''}`}>
            <button type="button" className={`side-module toggle${here ? ' here' : ''}`} aria-expanded={expanded}
              onClick={() => toggle(module.key, !expanded)}>
              <span className="side-icon"><Icon name={asIcon(module.icon)} /></span>
              <span className="spacer">{module.name}</span>
              <Icon name={expanded ? 'chevronDown' : 'chevron'} />
            </button>
            {expanded && <ul className="side-sections">
              {module.sections.map(section => {
                const target = SECTION_HREF[section.key];
                if (!target) return null;
                const current = target.pages.includes(page);
                return <li key={section.key}>
                  <a href={target.href} aria-current={current ? 'page' : undefined}>
                    <Icon name={asIcon(section.icon)} /><span className="spacer">{section.name}</span>
                    {section.key === 'results' && pending > 0 && <span className="count-pill" title="Results waiting for review">{pending}</span>}
                  </a>
                </li>;
              })}
            </ul>}
          </div>;
        })}
        <div className="side-foot">
          <a href="#/team" className="side-module" aria-current={page === 'team' ? 'page' : undefined}>
            <span className="side-icon"><Icon name="team" /></span><span className="spacer">Workspace and team</span>
          </a>
        </div>
      </nav>
      <div className="shell-main">{children}</div>
    </div>
  </>;
}

/** Placeholder page for a module that is planned but not built yet. */
export function ModulePage({ moduleKey }: { moduleKey: string }) {
  const modules = useModules();
  const module = modules.find(item => item.key === moduleKey);
  if (!module) return <main className="page narrow"><div className="empty"><h2>Module not found</h2><a className="btn" href="#/">Back</a></div></main>;
  return <main className="page narrow">
    <section className="card module-hero">
      <span className="module-icon"><Icon name={asIcon(module.icon)} /></span>
      <span className="soon-pill big">Coming soon</span>
      <h1>{module.name}</h1>
      <p>{module.summary}</p>
      {module.highlights.length > 0 && <ul className="checklist">
        {module.highlights.map(item => <li key={item} className="ok"><span className="mark"><Icon name="check" /></span><span>{item}</span></li>)}
      </ul>}
      <div className="row">
        <a className="btn" href="#/guide"><Icon name="target" /> Use object detection now</a>
        <a className="btn ghost" href="#/programs"><Icon name="layers" /> Inspection programs</a>
      </div>
    </section>
  </main>;
}
