import { t } from "../i18n/i18n-util";
import { MapRenderer } from "../lib/map-renderer";
import { MapState, MapMode } from "../lib/map-state";
import { addPoint, closeDraft } from "map-polygon-editor";

let renderer: MapRenderer | null = null;
let state: MapState | null = null;

export function renderMap(container: HTMLElement) {
  const m = t().map;

  container.innerHTML = `
    <div class="map-page">
      <div class="map-toolbar">
        <h2>${m.title}</h2>
        <div class="toolbar-actions">
          <button id="btn-draw" class="toolbar-btn">${m.draw}</button>
        </div>
        <div id="drawing-controls" class="drawing-controls" style="display: none;">
          <button id="btn-close-draft" class="toolbar-btn">${m.closeDraft}</button>
          <button id="btn-cancel-draw" class="toolbar-btn btn-secondary">${m.cancelDraw}</button>
        </div>
      </div>
      <div id="map-container" class="map-container"></div>
    </div>
  `;

  // 状態管理
  state = new MapState();
  renderer = new MapRenderer();

  const mapEl = document.getElementById("map-container")!;
  renderer.mount(mapEl, {
    onMapClick: (lat, lng) => {
      if (state!.mode === MapMode.Drawing && state!.draft) {
        state!.draft = addPoint(state!.draft, { lat, lng });
        renderer!.renderDraft(state!.draft);
      }
    },
    onPolygonClick: (id) => {
      state!.selectPolygon(id);
      renderer!.highlightPolygon(state!.selectedPolygonId);
    },
  });

  // ツールバーのイベント
  document.getElementById("btn-draw")?.addEventListener("click", () => {
    state!.startDrawing();
    updateToolbar();
    renderer!.renderDraft(state!.draft);
    renderer!.setCursor("crosshair");
  });

  document.getElementById("btn-close-draft")?.addEventListener("click", () => {
    if (state!.draft && state!.draft.points.length >= 3) {
      state!.draft = closeDraft(state!.draft);
      renderer!.renderDraft(state!.draft);
      // TODO: saveAsPolygon via MapPolygonEditor
    }
  });

  document.getElementById("btn-cancel-draw")?.addEventListener("click", () => {
    state!.cancelDrawing();
    updateToolbar();
    renderer!.renderDraft(null);
    renderer!.setCursor("");
  });
}

function updateToolbar() {
  if (!state) return;
  const drawBtn = document.getElementById("btn-draw");
  const drawingControls = document.getElementById("drawing-controls");

  if (drawBtn)
    drawBtn.style.display = state.mode === MapMode.Viewing ? "" : "none";
  if (drawingControls)
    drawingControls.style.display =
      state.mode === MapMode.Drawing ? "flex" : "none";
}
