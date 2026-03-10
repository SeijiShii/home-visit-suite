import { t } from '../i18n/i18n-util';

export function renderMap(container: HTMLElement) {
  const m = t().map;
  container.innerHTML = `
    <h1>${m.title}</h1>
    <div id="map-container" style="width: 100%; height: calc(100vh - 120px);">
      <p>${m.loading}</p>
    </div>
  `;
}
