import { renderDashboard } from './pages/dashboard';
import { renderMap } from './pages/map';
import { renderUsers } from './pages/users';
import { renderActivities } from './pages/activities';
import { renderCoverage } from './pages/coverage';
import { renderRequests } from './pages/requests';

type PageRenderer = (container: HTMLElement) => void;

interface Route {
  path: string;
  label: string;
  render: PageRenderer;
}

const routes: Route[] = [
  { path: '',           label: 'Dashboard',  render: renderDashboard },
  { path: '#map',       label: 'Map',        render: renderMap },
  { path: '#users',     label: 'Users',      render: renderUsers },
  { path: '#activities', label: 'Activities', render: renderActivities },
  { path: '#coverage',  label: 'Coverage',   render: renderCoverage },
  { path: '#requests',  label: 'Requests',   render: renderRequests },
];

function createNav(): string {
  return `<nav class="sidebar">
    ${routes.map(r => `<a href="${r.path || '#'}" class="nav-link">${r.label}</a>`).join('')}
  </nav>`;
}

export const router = {
  resolve(hash: string): PageRenderer {
    const route = routes.find(r => r.path === hash) || routes[0];
    return (container: HTMLElement) => {
      container.innerHTML = `
        <div class="layout">
          ${createNav()}
          <main class="content" id="page-content"></main>
        </div>
      `;
      const content = document.getElementById('page-content')!;
      route.render(content);
    };
  }
};
