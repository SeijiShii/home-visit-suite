import { t } from '../i18n/i18n-util';

export function renderActivities(container: HTMLElement) {
  const a = t().activities;
  container.innerHTML = `
    <h1>${a.title}</h1>
    <section>
      <h2>${a.active}</h2>
      <p>${a.noActive}</p>
    </section>
    <section>
      <h2>${a.completed}</h2>
      <p>${a.noCompleted}</p>
    </section>
  `;
}
