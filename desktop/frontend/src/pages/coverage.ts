import { t } from '../i18n/i18n-util';

export function renderCoverage(container: HTMLElement) {
  const c = t().coverage;
  container.innerHTML = `
    <h1>${c.title}</h1>
    <section>
      <h2>${c.progress}</h2>
      <p>${c.noData}</p>
    </section>
    <section>
      <h2>${c.plans}</h2>
      <p>${c.noPlans}</p>
    </section>
  `;
}
