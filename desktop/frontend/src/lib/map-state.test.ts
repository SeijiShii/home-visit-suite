import { describe, it, expect, beforeEach } from "vitest";
import { MapState, MapMode } from "./map-state";

describe("MapState", () => {
  let state: MapState;

  beforeEach(() => {
    state = new MapState();
  });

  describe("初期状態", () => {
    it("モードはviewing", () => {
      expect(state.mode).toBe(MapMode.Viewing);
    });

    it("選択中ポリゴンはない", () => {
      expect(state.selectedPolygonId).toBeNull();
    });

    it("ドラフトは空", () => {
      expect(state.draft).toBeNull();
    });
  });

  describe("モード遷移", () => {
    it("viewing → drawing に遷移できる", () => {
      state.startDrawing();
      expect(state.mode).toBe(MapMode.Drawing);
      expect(state.draft).not.toBeNull();
      expect(state.draft!.points).toEqual([]);
      expect(state.draft!.isClosed).toBe(false);
    });

    it("startDrawingForAreaで対象区域ID付きで描画開始する", () => {
      state.startDrawingForArea("NRT-001-01");
      expect(state.mode).toBe(MapMode.Drawing);
      expect(state.drawingController.isActive).toBe(true);
      expect(state.drawingController.targetAreaId).toBe("NRT-001-01");
      expect(state.draft).not.toBeNull();
    });

    it("drawing → viewing にキャンセルできる", () => {
      state.startDrawing();
      state.cancelDrawing();
      expect(state.mode).toBe(MapMode.Viewing);
      expect(state.draft).toBeNull();
    });

    it("startDrawingForArea後のcancelDrawingでDrawingControllerもリセットされる", () => {
      state.startDrawingForArea("NRT-001-01");
      state.cancelDrawing();
      expect(state.mode).toBe(MapMode.Viewing);
      expect(state.drawingController.isActive).toBe(false);
      expect(state.drawingController.targetAreaId).toBeNull();
    });

    it("viewing → editing に遷移できる", () => {
      state.startEditing("p1" as any);
      expect(state.mode).toBe(MapMode.Editing);
      expect(state.selectedPolygonId).toBe("p1");
    });

    it("editing → viewing にキャンセルできる", () => {
      state.startEditing("p1" as any);
      state.cancelEditing();
      expect(state.mode).toBe(MapMode.Viewing);
      expect(state.selectedPolygonId).toBeNull();
    });
  });

  describe("ポリゴン選択", () => {
    it("viewingモードでポリゴンを選択できる", () => {
      state.selectPolygon("p1" as any);
      expect(state.selectedPolygonId).toBe("p1");
    });

    it("選択を解除できる", () => {
      state.selectPolygon("p1" as any);
      state.selectPolygon(null);
      expect(state.selectedPolygonId).toBeNull();
    });

    it("drawingモードでは選択を変更しない", () => {
      state.startDrawing();
      state.selectPolygon("p1" as any);
      expect(state.selectedPolygonId).toBeNull();
    });
  });

  describe("ドラフト更新", () => {
    it("updateDraftでドラフトを更新し通知する", () => {
      let notified = false;
      state.onChange(() => {
        notified = true;
      });

      const mockDraft = {
        points: [{ lat: 35, lng: 140 }],
        isClosed: false,
      } as any;
      state.updateDraft(mockDraft);

      expect(state.draft).toBe(mockDraft);
      expect(notified).toBe(true);
    });

    it("updateDraft(null)でドラフトをクリアできる", () => {
      state.startDrawing();
      state.updateDraft(null);
      expect(state.draft).toBeNull();
    });
  });

  describe("描画フロー（startDrawingForArea経由）", () => {
    it("handleMapClickでポイントを追加し通知する", () => {
      state.startDrawingForArea("NRT-001-01");
      let notified = false;
      state.onChange(() => {
        notified = true;
      });

      state.handleMapClick(35.776, 140.318);

      expect(state.draft!.points).toHaveLength(1);
      expect(notified).toBe(true);
    });

    it("handleMapClickは常にポイントを追加する（スナップ判定はUI層で実施）", () => {
      state.startDrawingForArea("NRT-001-01");
      state.handleMapClick(35.776, 140.318);
      state.handleMapClick(35.777, 140.319);
      state.handleMapClick(35.778, 140.32);
      state.handleMapClick(35.776, 140.318);

      expect(state.draft!.points).toHaveLength(4);
      expect(state.draft!.isClosed).toBe(false);
    });

    it("描画モードでない場合はhandleMapClickで何もしない", () => {
      state.handleMapClick(35.776, 140.318);
      expect(state.draft).toBeNull();
    });

    it("closeDrawingで明示的にクローズする", () => {
      state.startDrawingForArea("NRT-001-01");
      state.handleMapClick(35.776, 140.318);
      state.handleMapClick(35.777, 140.319);
      state.handleMapClick(35.778, 140.32);

      state.closeDrawing();

      expect(state.draft!.isClosed).toBe(true);
    });

    it("3点未満でcloseDrawingは何もしない", () => {
      state.startDrawingForArea("NRT-001-01");
      state.handleMapClick(35.776, 140.318);

      state.closeDrawing();

      expect(state.draft!.isClosed).toBe(false);
    });

    it("finalizeDrawingでクローズ済みドラフトと区域IDを返す", () => {
      state.startDrawingForArea("NRT-001-01");
      state.handleMapClick(35.776, 140.318);
      state.handleMapClick(35.777, 140.319);
      state.handleMapClick(35.778, 140.32);
      state.closeDrawing();

      const result = state.finalizeDrawing();

      expect(result).not.toBeNull();
      expect(result!.targetAreaId).toBe("NRT-001-01");
      expect(result!.draft.isClosed).toBe(true);
      expect(state.mode).toBe(MapMode.Viewing);
    });

    it("undoLastPointで最後のポイントを削除する", () => {
      state.startDrawingForArea("NRT-001-01");
      state.handleMapClick(35.776, 140.318);
      state.handleMapClick(35.777, 140.319);

      state.undoLastPoint();

      expect(state.draft!.points).toHaveLength(1);
    });
  });

  describe("変更通知", () => {
    it("リスナーがモード変更を受け取る", () => {
      const changes: MapMode[] = [];
      state.onChange(() => changes.push(state.mode));

      state.startDrawing();
      state.cancelDrawing();

      expect(changes).toEqual([MapMode.Drawing, MapMode.Viewing]);
    });

    it("リスナーを解除できる", () => {
      let count = 0;
      const unsubscribe = state.onChange(() => count++);

      state.startDrawing();
      unsubscribe();
      state.cancelDrawing();

      expect(count).toBe(1);
    });
  });
});
