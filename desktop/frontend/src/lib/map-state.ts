import type { PolygonID, DraftShape } from "map-polygon-editor";
import { createDraft } from "map-polygon-editor";

export enum MapMode {
  Viewing = "viewing",
  Drawing = "drawing",
  Editing = "editing",
}

type ChangeListener = () => void;

export class MapState {
  mode: MapMode = MapMode.Viewing;
  selectedPolygonId: PolygonID | null = null;
  draft: DraftShape | null = null;

  private listeners: ChangeListener[] = [];

  startDrawing(): void {
    this.mode = MapMode.Drawing;
    this.selectedPolygonId = null;
    this.draft = createDraft();
    this.notify();
  }

  cancelDrawing(): void {
    this.mode = MapMode.Viewing;
    this.draft = null;
    this.notify();
  }

  startEditing(polygonId: PolygonID): void {
    this.mode = MapMode.Editing;
    this.selectedPolygonId = polygonId;
    this.notify();
  }

  cancelEditing(): void {
    this.mode = MapMode.Viewing;
    this.selectedPolygonId = null;
    this.draft = null;
    this.notify();
  }

  updateDraft(draft: DraftShape | null): void {
    this.draft = draft;
    this.notify();
  }

  selectPolygon(id: PolygonID | null): void {
    if (this.mode !== MapMode.Viewing) return;
    this.selectedPolygonId = id;
    this.notify();
  }

  onChange(fn: ChangeListener): () => void {
    this.listeners.push(fn);
    return () => {
      const idx = this.listeners.indexOf(fn);
      if (idx >= 0) this.listeners.splice(idx, 1);
    };
  }

  private notify(): void {
    this.listeners.forEach((fn) => fn());
  }
}
