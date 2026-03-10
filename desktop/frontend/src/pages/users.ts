import { t } from '../i18n/i18n-util';

export function renderUsers(container: HTMLElement) {
  const u = t().users;
  container.innerHTML = `
    <h1>${u.title}</h1>
    <section>
      <h2>${u.members}</h2>
      <p>${u.noMembers}</p>
    </section>
    <section>
      <h2>${u.groups}</h2>
      <p>${u.noGroups}</p>
    </section>
  `;
}
