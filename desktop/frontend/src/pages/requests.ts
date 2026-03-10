import { t } from '../i18n/i18n-util';

export function renderRequests(container: HTMLElement) {
  const r = t().requests;
  container.innerHTML = `
    <h1>${r.title}</h1>
    <section>
      <h2>${r.pending}</h2>
      <p>${r.noPending}</p>
    </section>
    <section>
      <h2>${r.resolved}</h2>
      <p>${r.noResolved}</p>
    </section>
  `;
}
