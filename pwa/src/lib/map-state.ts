import type { PolygonID } from "map-polygon-editor";

export enum MapMode {
  Idle = "idle",
  Drawing = "drawing",
  Editing = "editing",
  AreaDetailEditing = "areaDetailEditing",
}

type ChangeListener = () => void;

export class MapState {
  mode: MapMode = MapMode.Idle;
  selectedPolygonId: PolygonID | null = null;
  detailAreaId: string | null = null;

  private listeners: ChangeListener[] = [];

  startDrawing(): void {
    this.mode = MapMode.Drawing;
    this.selectedPolygonId = null;
    this.notify();
  }

  endDrawing(): void {
    this.mode = MapMode.Idle;
    this.notify();
  }

  startEditing(polygonId: PolygonID): void {
    this.mode = MapMode.Editing;
    this.selectedPolygonId = polygonId;
    this.notify();
  }

  endEditing(): void {
    this.mode = MapMode.Idle;
    this.selectedPolygonId = null;
    this.notify();
  }

  startAreaDetailEditing(areaId: string, polygonId: PolygonID): void {
    this.mode = MapMode.AreaDetailEditing;
    this.selectedPolygonId = polygonId;
    this.detailAreaId = areaId;
    this.notify();
  }

  endAreaDetailEditing(): void {
    this.mode = MapMode.Idle;
    this.detailAreaId = null;
    this.notify();
  }

  selectPolygon(id: PolygonID | null): void {
    if (this.mode !== MapMode.Idle) return;
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
