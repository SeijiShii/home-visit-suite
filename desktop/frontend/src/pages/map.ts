// 地図ページ
// map-polygon-editor を統合し、領域・区域のポリゴン編集を行う
// GSIタイル（国土地理院地図）を使用
export function renderMap(container: HTMLElement) {
  container.innerHTML = `
    <h1>Map</h1>
    <div id="map-container" style="width: 100%; height: calc(100vh - 120px);">
      <!-- map-polygon-editor will be mounted here -->
      <p>Map loading...</p>
    </div>
  `;
  // TODO: map-polygon-editor の初期化
  // import { MapEditor } from '../lib/map-editor';
}
