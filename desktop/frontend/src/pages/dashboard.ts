import { t } from '../i18n/i18n-util';

export function renderDashboard(container: HTMLElement) {
  const d = t().dashboard;
  container.innerHTML = `
    <h1>${d.title}</h1>
    <section>
      <h2>${d.notifications}</h2>
      <p>${d.noNotifications}</p>
    </section>
    <section>
      <h2>${d.assignedAreas}</h2>
      <p>${d.noAssignedAreas}</p>
    </section>
  `;
}
