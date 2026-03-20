import { describe, it, expect, beforeEach } from "vitest";
import { MapState, MapMode } from "./map-state";

describe("MapState", () => {
  let state: MapState;

  beforeEach(() => {
    state = new MapState();
  });

  describe("初期状態", () => {
    it("モードはidle", () => {
      expect(state.mode).toBe(MapMode.Idle);
    });

    it("選択中ポリゴンはない", () => {
      expect(state.selectedPolygonId).toBeNull();
    });
  });

  describe("モード遷移", () => {
    it("idle → drawing に遷移できる", () => {
      state.startDrawing();
      expect(state.mode).toBe(MapMode.Drawing);
    });

    it("描画開始で選択解除される", () => {
      state.selectPolygon("p1" as any);
      state.startDrawing();
      expect(state.selectedPolygonId).toBeNull();
    });

    it("drawing → idle に描画終了できる", () => {
      state.startDrawing();
      state.endDrawing();
      expect(state.mode).toBe(MapMode.Idle);
    });

    it("idle → editing に遷移できる", () => {
      state.startEditing("p1" as any);
      expect(state.mode).toBe(MapMode.Editing);
      expect(state.selectedPolygonId).toBe("p1");
    });

    it("editing → idle に編集終了できる", () => {
      state.startEditing("p1" as any);
      state.endEditing();
      expect(state.mode).toBe(MapMode.Idle);
      expect(state.selectedPolygonId).toBeNull();
    });
  });

  describe("ポリゴン選択", () => {
    it("idleモードでポリゴンを選択できる", () => {
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

  describe("変更通知", () => {
    it("リスナーがモード変更を受け取る", () => {
      const changes: MapMode[] = [];
      state.onChange(() => changes.push(state.mode));

      state.startDrawing();
      state.endDrawing();

      expect(changes).toEqual([MapMode.Drawing, MapMode.Idle]);
    });

    it("リスナーを解除できる", () => {
      let count = 0;
      const unsubscribe = state.onChange(() => count++);

      state.startDrawing();
      unsubscribe();
      state.endDrawing();

      expect(count).toBe(1);
    });
  });
});
