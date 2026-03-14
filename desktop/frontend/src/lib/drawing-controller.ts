import type { DraftShape } from "map-polygon-editor";
import {
  createDraft,
  addPoint,
  removePoint,
  closeDraft,
} from "map-polygon-editor";

export class DrawingController {
  private _draft: DraftShape | null = null;
  private _targetAreaId: string | null = null;

  get isActive(): boolean {
    return this._draft !== null;
  }

  get draft(): DraftShape | null {
    return this._draft;
  }

  get targetAreaId(): string | null {
    return this._targetAreaId;
  }

  get canClose(): boolean {
    return (
      this._draft !== null &&
      !this._draft.isClosed &&
      this._draft.points.length >= 3
    );
  }

  startDrawing(areaId: string): void {
    if (this._draft !== null) {
      throw new Error(
        "Already drawing. Cancel or finalize the current drawing first.",
      );
    }
    this._targetAreaId = areaId;
    this._draft = createDraft();
  }

  addPoint(lat: number, lng: number): void {
    if (!this._draft) {
      throw new Error("Not in drawing mode. Call startDrawing first.");
    }
    if (this._draft.isClosed) {
      throw new Error("Draft is already closed. Cannot add more points.");
    }
    this._draft = addPoint(this._draft, { lat, lng });
  }

  closeDraft(): void {
    if (!this._draft || this._draft.points.length < 3) {
      throw new Error("Cannot close draft with fewer than 3 points.");
    }
    this._draft = closeDraft(this._draft);
  }

  removeLastPoint(): void {
    if (!this._draft || this._draft.points.length === 0) return;
    this._draft = removePoint(this._draft, this._draft.points.length - 1);
  }

  cancel(): void {
    this._draft = null;
    this._targetAreaId = null;
  }

  finalize(): { draft: DraftShape; targetAreaId: string } {
    if (!this._draft || !this._draft.isClosed) {
      throw new Error("Cannot finalize: draft is not closed.");
    }
    if (!this._targetAreaId) {
      throw new Error("Cannot finalize: no target area.");
    }
    const result = { draft: this._draft, targetAreaId: this._targetAreaId };
    this._draft = null;
    this._targetAreaId = null;
    return result;
  }
}
