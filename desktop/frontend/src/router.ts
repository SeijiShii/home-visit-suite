import { renderDashboard } from './pages/dashboard';
import { renderMap } from './pages/map';
import { renderUsers } from './pages/users';
import { renderActivities } from './pages/activities';
import { renderCoverage } from './pages/coverage';
import { renderRequests } from './pages/requests';
import { t, getLocale, setLocale } from './i18n/i18n-util';
import type { Locales } from './i18n/i18n-types';

type PageRenderer = (container: HTMLElement) => void;

type NavKey = 'dashboard' | 'map' | 'users' | 'activities' | 'coverage' | 'requests';

interface Route {
  path: string;
  labelKey: NavKey;
  render: PageRenderer;
}

const routes: Route[] = [
  { path: '',            labelKey: 'dashboard',  render: renderDashboard },
  { path: '#map',        labelKey: 'map',        render: renderMap },
  { path: '#users',      labelKey: 'users',      render: renderUsers },
  { path: '#activities', labelKey: 'activities',  render: renderActivities },
  { path: '#coverage',   labelKey: 'coverage',    render: renderCoverage },
  { path: '#requests',   labelKey: 'requests',    render: renderRequests },
];

function createNav(activeHash: string): string {
  const locale = getLocale();
  const otherLocale: Locales = locale === 'ja' ? 'en' : 'ja';
  const nav = t().nav;

  return `<nav class="sidebar">
    <div class="sidebar-header">
      <h3 class="app-title">Home Visit Suite</h3>
    </div>
    <div class="nav-links">
      ${routes.map(r => {
        const isActive = r.path === activeHash || (r.path === '' && activeHash === '#');
        return `<a href="${r.path || '#'}" class="nav-link${isActive ? ' active' : ''}">${nav[r.labelKey]}</a>`;
      }).join('')}
    </div>
    <div class="sidebar-footer">
      <button class="locale-btn" id="locale-toggle">${otherLocale.toUpperCase()}</button>
    </div>
  </nav>`;
}

export const router = {
  resolve(hash: string): PageRenderer {
    const route = routes.find(r => r.path === hash) || routes[0];
    return (container: HTMLElement) => {
      container.innerHTML = `
        <div class="layout">
          ${createNav(hash)}
          <main class="content" id="page-content"></main>
        </div>
      `;
      const content = document.getElementById('page-content')!;
      route.render(content);

      document.getElementById('locale-toggle')?.addEventListener('click', () => {
        const newLocale: Locales = getLocale() === 'ja' ? 'en' : 'ja';
        setLocale(newLocale);
        router.resolve(hash)(container);
      });
    };
  }
};
