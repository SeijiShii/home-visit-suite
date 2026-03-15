import type { PolygonID, DraftShape } from "map-polygon-editor";
import { DrawingController, type FinalizeResult } from "./drawing-controller";

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
  readonly drawingController = new DrawingController();

  private listeners: ChangeListener[] = [];

  startDrawing(): void {
    this.drawingController.startFreeDrawing();
    this.mode = MapMode.Drawing;
    this.selectedPolygonId = null;
    this.draft = this.drawingController.draft;
    this.notify();
  }

  startDrawingForArea(areaId: string): void {
    this.drawingController.startDrawing(areaId);
    this.mode = MapMode.Drawing;
    this.selectedPolygonId = null;
    this.draft = this.drawingController.draft;
    this.notify();
  }

  cancelDrawing(): void {
    this.mode = MapMode.Viewing;
    this.draft = null;
    this.drawingController.cancel();
    this.notify();
  }

  handleMapClick(lat: number, lng: number): void {
    if (this.mode !== MapMode.Drawing || !this.drawingController.isActive)
      return;

    this.drawingController.addPoint(lat, lng);
    this.draft = this.drawingController.draft;
    this.notify();
  }

  closeDrawing(): void {
    if (!this.drawingController.isActive || !this.drawingController.canClose)
      return;
    this.drawingController.closeDraft();
    this.draft = this.drawingController.draft;
    this.notify();
  }

  finalizeDrawing(): FinalizeResult | null {
    if (!this.drawingController.isActive) return null;
    try {
      const result = this.drawingController.finalize();
      this.mode = MapMode.Viewing;
      this.draft = null;
      this.notify();
      return result;
    } catch {
      return null;
    }
  }

  undoLastPoint(): void {
    if (!this.drawingController.isActive) return;
    this.drawingController.removeLastPoint();
    // 頂点が0になったら描画モードを解除
    if (this.drawingController.draft?.points.length === 0) {
      this.drawingController.cancel();
      this.mode = MapMode.Viewing;
      this.draft = null;
      this.notify();
      return;
    }
    this.draft = this.drawingController.draft;
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
