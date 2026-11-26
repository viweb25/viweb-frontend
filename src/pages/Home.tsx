import { useSession } from '../context/SessionContext';
import { Icon, type IconName } from '../ui/Icon';
import { useModules } from './detection/AppShell';

/** Where an available module opens: its Getting started page. */
const MODULE_HOME: Record<string, string> = {
  'object-detection': '#/guide',
};

/** Home: pick a module. Each module opens on its own Getting started page. */
export function Home() {
  const { user } = useSession();
  const modules = useModules();
  const firstName = (user.display_name || '').trim().split(/\s+/)[0];
  const available = modules.filter(module => module.status === 'available');
  const soon = modules.filter(module => module.status !== 'available');

  return <main className="page home">
    <header className="home-head">
      <h1>{firstName ? `Hi ${firstName}` : 'Hi'} <span aria-hidden="true">👋</span></h1>
      <p>What do you want to check today?</p>
    </header>

    <section className="home-grid" aria-label="Modules">
      {available.map(module => <a key={module.key} className="home-card" href={MODULE_HOME[module.key] ?? `#/modules/${module.key}`}>
        <span className="home-card-icon"><Icon name={module.icon as IconName} /></span>
        <h2>{module.name}</h2>
        <p>{module.summary}</p>
        <ul className="home-card-sections" aria-label="Inside">
          {module.sections.filter(section => section.key !== 'guide').map(section =>
            <li key={section.key}><Icon name={section.icon as IconName} /> {section.name}</li>)}
        </ul>
        <span className="btn home-card-open">Open <Icon name="arrow" /></span>
      </a>)}

      {soon.map(module => <a key={module.key} className="home-card soon" href={`#/modules/${module.key}`}>
        <span className="home-card-icon"><Icon name={module.icon as IconName} /></span>
        <h2>{module.name}</h2>
        <p>{module.summary}</p>
        <span className="soon-pill">Coming soon</span>
      </a>)}
    </section>
  </main>;
}
