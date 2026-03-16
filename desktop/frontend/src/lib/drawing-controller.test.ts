import { describe, it, expect, beforeEach } from "vitest";
import { DrawingController } from "./drawing-controller";

describe("DrawingController", () => {
  let controller: DrawingController;

  beforeEach(() => {
    controller = new DrawingController();
  });

  describe("初期状態", () => {
    it("描画中ではない", () => {
      expect(controller.isActive).toBe(false);
    });

    it("ドラフトはnull", () => {
      expect(controller.draft).toBeNull();
    });

    it("対象区域IDはnull", () => {
      expect(controller.targetAreaId).toBeNull();
    });
  });

  describe("startDrawing", () => {
    it("対象区域IDを設定して描画を開始する", () => {
      controller.startDrawing("NRT-001-01");

      expect(controller.isActive).toBe(true);
      expect(controller.targetAreaId).toBe("NRT-001-01");
      expect(controller.draft).not.toBeNull();
      expect(controller.draft!.points).toEqual([]);
      expect(controller.draft!.isClosed).toBe(false);
    });

    it("既に描画中の場合はエラーをスローする", () => {
      controller.startDrawing("NRT-001-01");
      expect(() => controller.startDrawing("NRT-001-02")).toThrow();
    });
  });

  describe("addPoint", () => {
    beforeEach(() => {
      controller.startDrawing("NRT-001-01");
    });

    it("ポイントを追加するとドラフトに反映される", () => {
      controller.addPoint(35.776, 140.318);

      expect(controller.draft!.points).toHaveLength(1);
      expect(controller.draft!.points[0]).toEqual({
        lat: 35.776,
        lng: 140.318,
      });
    });

    it("複数ポイントを順次追加できる", () => {
      controller.addPoint(35.776, 140.318);
      controller.addPoint(35.777, 140.319);
      controller.addPoint(35.778, 140.32);

      expect(controller.draft!.points).toHaveLength(3);
    });

    it("描画中でなければエラーをスローする", () => {
      const c = new DrawingController();
      expect(() => c.addPoint(35.0, 140.0)).toThrow();
    });

    it("クローズ済みドラフトにはポイントを追加できない", () => {
      controller.addPoint(35.776, 140.318);
      controller.addPoint(35.777, 140.319);
      controller.addPoint(35.778, 140.32);
      controller.closeDraft();

      expect(() => controller.addPoint(35.779, 140.321)).toThrow();
    });
  });

  describe("canClose", () => {
    beforeEach(() => {
      controller.startDrawing("NRT-001-01");
    });

    it("ポイントが3つ未満ならfalse", () => {
      expect(controller.canClose).toBe(false);

      controller.addPoint(35.776, 140.318);
      expect(controller.canClose).toBe(false);

      controller.addPoint(35.777, 140.319);
      expect(controller.canClose).toBe(false);
    });

    it("ポイントが3つ以上ならtrue", () => {
      controller.addPoint(35.776, 140.318);
      controller.addPoint(35.777, 140.319);
      controller.addPoint(35.778, 140.32);

      expect(controller.canClose).toBe(true);
    });
  });

  describe("closeDraft", () => {
    beforeEach(() => {
      controller.startDrawing("NRT-001-01");
      controller.addPoint(35.776, 140.318);
      controller.addPoint(35.777, 140.319);
      controller.addPoint(35.778, 140.32);
    });

    it("ドラフトをクローズする", () => {
      controller.closeDraft();

      expect(controller.draft!.isClosed).toBe(true);
    });

    it("3ポイント未満ではクローズできない", () => {
      const c = new DrawingController();
      c.startDrawing("NRT-001-01");
      c.addPoint(35.776, 140.318);

      expect(() => c.closeDraft()).toThrow();
    });
  });

  describe("removeLastPoint", () => {
    beforeEach(() => {
      controller.startDrawing("NRT-001-01");
    });

    it("最後のポイントを削除する", () => {
      controller.addPoint(35.776, 140.318);
      controller.addPoint(35.777, 140.319);
      controller.removeLastPoint();

      expect(controller.draft!.points).toHaveLength(1);
      expect(controller.draft!.points[0].lat).toBe(35.776);
    });

    it("ポイントがなければ何もしない", () => {
      controller.removeLastPoint();
      expect(controller.draft!.points).toHaveLength(0);
    });
  });

  describe("cancel", () => {
    it("描画をキャンセルして初期状態に戻す", () => {
      controller.startDrawing("NRT-001-01");
      controller.addPoint(35.776, 140.318);
      controller.cancel();

      expect(controller.isActive).toBe(false);
      expect(controller.draft).toBeNull();
      expect(controller.targetAreaId).toBeNull();
    });
  });

  describe("startFreeDrawing", () => {
    it("対象区域IDなしで描画を開始する", () => {
      controller.startFreeDrawing();

      expect(controller.isActive).toBe(true);
      expect(controller.targetAreaId).toBeNull();
      expect(controller.draft).not.toBeNull();
      expect(controller.draft!.points).toEqual([]);
    });

    it("既に描画中の場合はエラーをスローする", () => {
      controller.startFreeDrawing();
      expect(() => controller.startFreeDrawing()).toThrow();
    });
  });

  describe("ブリッジアンカー", () => {
    it("setBridgeStartで開始アンカーを記録する", () => {
      controller.startFreeDrawing();
      controller.setBridgeStart("poly-1", 2);

      expect(controller.bridgeStart).toEqual({
        polygonId: "poly-1",
        vertexIndex: 2,
      });
    });

    it("setBridgeEndで終了アンカーを記録する", () => {
      controller.startFreeDrawing();
      controller.setBridgeEnd("poly-1", 5);

      expect(controller.bridgeEnd).toEqual({
        polygonId: "poly-1",
        vertexIndex: 5,
      });
    });

    it("cancelでアンカーもリセットされる", () => {
      controller.startFreeDrawing();
      controller.setBridgeStart("poly-1", 2);
      controller.setBridgeEnd("poly-1", 5);
      controller.cancel();

      expect(controller.bridgeStart).toBeNull();
      expect(controller.bridgeEnd).toBeNull();
    });

    it("finalizeでブリッジ情報が返る（異なるポリゴン間）", () => {
      controller.startFreeDrawing();
      controller.setBridgeStart("poly-1", 0);
      controller.addPoint(35.776, 140.318);
      controller.addPoint(35.777, 140.319);
      controller.addPoint(35.778, 140.32);
      controller.setBridgeEnd("poly-2", 3);
      controller.closeDraft();

      const result = controller.finalize();
      expect(result.bridgeInfo).toEqual({
        startPolygonId: "poly-1",
        startVertexIndex: 0,
        endPolygonId: "poly-2",
        endVertexIndex: 3,
      });
    });

    it("アンカーなしのfinalizeではbridgeInfoがnull", () => {
      controller.startFreeDrawing();
      controller.addPoint(35.776, 140.318);
      controller.addPoint(35.777, 140.319);
      controller.addPoint(35.778, 140.32);
      controller.closeDraft();

      const result = controller.finalize();
      expect(result.bridgeInfo).toBeNull();
    });
  });

  describe("finalize", () => {
    beforeEach(() => {
      controller.startDrawing("NRT-001-01");
      controller.addPoint(35.776, 140.318);
      controller.addPoint(35.777, 140.319);
      controller.addPoint(35.778, 140.32);
      controller.closeDraft();
    });

    it("クローズ済みドラフトと対象区域IDを返す", () => {
      const result = controller.finalize();

      expect(result.draft.isClosed).toBe(true);
      expect(result.draft.points).toHaveLength(3);
      expect(result.targetAreaId).toBe("NRT-001-01");
    });

    it("finalize後は初期状態に戻る", () => {
      controller.finalize();

      expect(controller.isActive).toBe(false);
      expect(controller.draft).toBeNull();
      expect(controller.targetAreaId).toBeNull();
    });

    it("フリー描画時はtargetAreaIdがnullで返る", () => {
      const c = new DrawingController();
      c.startFreeDrawing();
      c.addPoint(35.776, 140.318);
      c.addPoint(35.777, 140.319);
      c.addPoint(35.778, 140.32);
      c.closeDraft();

      const result = c.finalize();
      expect(result.targetAreaId).toBeNull();
      expect(result.draft.isClosed).toBe(true);
    });

    it("クローズされていなければエラーをスローする", () => {
      const c = new DrawingController();
      c.startDrawing("NRT-001-01");
      c.addPoint(35.776, 140.318);
      c.addPoint(35.777, 140.319);
      c.addPoint(35.778, 140.32);

      expect(() => c.finalize()).toThrow();
    });

    it("splitMode中にfinalizeを呼ぶとエラーをスローする", () => {
      const c = new DrawingController();
      c.startFreeDrawing();
      c.setBridgeStart("poly-1", 0);
      c.addPoint(35.776, 140.318);
      c.addPoint(35.777, 140.319);
      c.addPoint(35.778, 140.32);
      c.setBridgeEnd("poly-1", 3);
      c.closeDraft();

      expect(() => c.finalize()).toThrow("split mode");
    });
  });

  describe("ポリゴン分割 (split)", () => {
    describe("isSplitMode", () => {
      it("同一ポリゴンの異なる頂点にアンカーがある場合trueを返す", () => {
        controller.startFreeDrawing();
        controller.setBridgeStart("poly-1", 0);
        controller.addPoint(35.776, 140.318);
        controller.addPoint(35.777, 140.319);
        controller.setBridgeEnd("poly-1", 3);

        expect(controller.isSplitMode).toBe(true);
      });

      it("異なるポリゴンにアンカーがある場合falseを返す（ブリッジ）", () => {
        controller.startFreeDrawing();
        controller.setBridgeStart("poly-1", 0);
        controller.addPoint(35.776, 140.318);
        controller.addPoint(35.777, 140.319);
        controller.setBridgeEnd("poly-2", 3);

        expect(controller.isSplitMode).toBe(false);
      });

      it("アンカーが片方しかない場合falseを返す", () => {
        controller.startFreeDrawing();
        controller.setBridgeStart("poly-1", 0);
        controller.addPoint(35.776, 140.318);

        expect(controller.isSplitMode).toBe(false);
      });

      it("アンカーがない場合falseを返す", () => {
        controller.startFreeDrawing();
        controller.addPoint(35.776, 140.318);

        expect(controller.isSplitMode).toBe(false);
      });

      it("同一ポリゴンの同一頂点の場合falseを返す", () => {
        controller.startFreeDrawing();
        controller.setBridgeStart("poly-1", 0);
        controller.addPoint(35.776, 140.318);
        controller.setBridgeEnd("poly-1", 0);

        expect(controller.isSplitMode).toBe(false);
      });
    });

    describe("splitTargetPolygonId", () => {
      it("splitMode時に対象ポリゴンIDを返す", () => {
        controller.startFreeDrawing();
        controller.setBridgeStart("poly-1", 0);
        controller.addPoint(35.776, 140.318);
        controller.addPoint(35.777, 140.319);
        controller.setBridgeEnd("poly-1", 3);

        expect(controller.splitTargetPolygonId).toBe("poly-1");
      });

      it("splitModeでない場合nullを返す", () => {
        controller.startFreeDrawing();
        controller.addPoint(35.776, 140.318);

        expect(controller.splitTargetPolygonId).toBeNull();
      });
    });

    describe("finalizeSplit", () => {
      it("openドラフトとsplitInfoを返す", () => {
        controller.startFreeDrawing();
        controller.setBridgeStart("poly-1", 0);
        controller.addPoint(35.776, 140.318);
        controller.addPoint(35.7765, 140.3185);
        controller.addPoint(35.777, 140.319);
        controller.setBridgeEnd("poly-1", 3);

        const result = controller.finalizeSplit();

        expect(result.draft.isClosed).toBe(false);
        expect(result.draft.points).toHaveLength(3);
        expect(result.splitInfo).toEqual({
          polygonId: "poly-1",
          startVertexIndex: 0,
          endVertexIndex: 3,
        });
      });

      it("finalizeSplit後は初期状態に戻る", () => {
        controller.startFreeDrawing();
        controller.setBridgeStart("poly-1", 0);
        controller.addPoint(35.776, 140.318);
        controller.addPoint(35.777, 140.319);
        controller.setBridgeEnd("poly-1", 3);

        controller.finalizeSplit();

        expect(controller.isActive).toBe(false);
        expect(controller.draft).toBeNull();
        expect(controller.bridgeStart).toBeNull();
        expect(controller.bridgeEnd).toBeNull();
      });

      it("splitModeでない場合はエラーをスローする", () => {
        controller.startFreeDrawing();
        controller.addPoint(35.776, 140.318);
        controller.addPoint(35.777, 140.319);
        controller.addPoint(35.778, 140.32);

        expect(() => controller.finalizeSplit()).toThrow();
      });

      it("ポイントが2つ未満ではエラーをスローする", () => {
        controller.startFreeDrawing();
        controller.setBridgeStart("poly-1", 0);
        controller.addPoint(35.776, 140.318);
        controller.setBridgeEnd("poly-1", 3);

        expect(() => controller.finalizeSplit()).toThrow();
      });
    });
  });
});
