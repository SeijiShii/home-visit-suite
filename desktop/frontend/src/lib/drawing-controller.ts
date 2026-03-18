import type { DraftShape } from "map-polygon-editor";
import {
  createDraft,
  addPoint,
  removePoint,
  closeDraft,
} from "map-polygon-editor";

export interface BridgeAnchor {
  polygonId: string;
  vertexIndex: number;
}

export interface BridgeInfo {
  startPolygonId: string;
  startVertexIndex: number;
  endPolygonId: string;
  endVertexIndex: number;
}

export interface SplitInfo {
  polygonId: string;
  startVertexIndex: number;
  endVertexIndex: number;
}

export interface FinalizeResult {
  draft: DraftShape;
  targetAreaId: string | null;
  bridgeInfo: BridgeInfo | null;
}

export interface FinalizeSplitResult {
  draft: DraftShape;
  splitInfo: SplitInfo;
}

export class DrawingController {
  private _draft: DraftShape | null = null;
  private _targetAreaId: string | null = null;
  private _bridgeStart: BridgeAnchor | null = null;
  private _bridgeEnd: BridgeAnchor | null = null;

  get isActive(): boolean {
    return this._draft !== null;
  }

  get draft(): DraftShape | null {
    return this._draft;
  }

  get targetAreaId(): string | null {
    return this._targetAreaId;
  }

  get bridgeStart(): BridgeAnchor | null {
    return this._bridgeStart;
  }

  get bridgeEnd(): BridgeAnchor | null {
    return this._bridgeEnd;
  }

  get canClose(): boolean {
    return (
      this._draft !== null &&
      !this._draft.isClosed &&
      this._draft.points.length >= 3
    );
  }

  /** 同一ポリゴンの異なる2頂点にアンカーがある場合 true */
  get isSplitMode(): boolean {
    return (
      this._bridgeStart !== null &&
      this._bridgeEnd !== null &&
      this._bridgeStart.polygonId === this._bridgeEnd.polygonId &&
      this._bridgeStart.vertexIndex !== this._bridgeEnd.vertexIndex
    );
  }

  /** splitMode時に対象ポリゴンIDを返す */
  get splitTargetPolygonId(): string | null {
    return this.isSplitMode ? this._bridgeStart!.polygonId : null;
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

  startFreeDrawing(): void {
    if (this._draft !== null) {
      throw new Error(
        "Already drawing. Cancel or finalize the current drawing first.",
      );
    }
    this._targetAreaId = null;
    this._draft = createDraft();
  }

  setBridgeStart(polygonId: string, vertexIndex: number): void {
    this._bridgeStart = { polygonId, vertexIndex };
  }

  setBridgeEnd(polygonId: string, vertexIndex: number): void {
    this._bridgeEnd = { polygonId, vertexIndex };
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

  /** ドラフトを差し替える（resolveOverlaps の残りドラフト継続用） */
  replaceDraft(draft: DraftShape): void {
    if (!this._draft) {
      throw new Error("Not in drawing mode. Call startDrawing first.");
    }
    this._draft = draft;
    this._bridgeStart = null;
    this._bridgeEnd = null;
  }

  cancel(): void {
    this._draft = null;
    this._targetAreaId = null;
    this._bridgeStart = null;
    this._bridgeEnd = null;
  }

  finalizeSplit(): FinalizeSplitResult {
    if (!this.isSplitMode) {
      throw new Error("Cannot finalizeSplit: not in split mode.");
    }
    if (!this._draft || this._draft.points.length < 2) {
      throw new Error("Cannot finalizeSplit: need at least 2 points.");
    }
    const result: FinalizeSplitResult = {
      draft: this._draft, // open draft (not closed)
      splitInfo: {
        polygonId: this._bridgeStart!.polygonId,
        startVertexIndex: this._bridgeStart!.vertexIndex,
        endVertexIndex: this._bridgeEnd!.vertexIndex,
      },
    };
    this._draft = null;
    this._targetAreaId = null;
    this._bridgeStart = null;
    this._bridgeEnd = null;
    return result;
  }

  finalize(): FinalizeResult {
    if (this.isSplitMode) {
      throw new Error("Cannot finalize in split mode. Use finalizeSplit().");
    }
    if (!this._draft || !this._draft.isClosed) {
      throw new Error("Cannot finalize: draft is not closed.");
    }
    const bridgeInfo =
      this._bridgeStart && this._bridgeEnd
        ? {
            startPolygonId: this._bridgeStart.polygonId,
            startVertexIndex: this._bridgeStart.vertexIndex,
            endPolygonId: this._bridgeEnd.polygonId,
            endVertexIndex: this._bridgeEnd.vertexIndex,
          }
        : null;
    const result: FinalizeResult = {
      draft: this._draft,
      targetAreaId: this._targetAreaId,
      bridgeInfo,
    };
    this._draft = null;
    this._targetAreaId = null;
    this._bridgeStart = null;
    this._bridgeEnd = null;
    return result;
  }
}
