import { describe, it, expect, vi, beforeEach } from "vitest";
import { PolygonService, buildPolygonAreaMap } from "./polygon-service";
import type {
  DraftShape,
  MapPolygon,
  PolygonID,
  BridgeResult,
  GeometryViolation,
} from "map-polygon-editor";

// MapPolygonEditor のモック
const createMockEditor = () => ({
  initialize: vi.fn().mockResolvedValue(undefined),
  saveAsPolygon: vi.fn(),
  getAllPolygons: vi.fn().mockReturnValue([]),
  getPolygon: vi.fn().mockReturnValue(null),
  deletePolygon: vi.fn().mockResolvedValue(undefined),
  loadPolygonToDraft: vi.fn(),
  updatePolygonGeometry: vi.fn(),
  bridgePolygons: vi.fn(),
  splitPolygon: vi.fn(),
  sharedEdgeMove: vi.fn(),
  findNearestVertex: vi.fn(),
  findEdgeIntersections: vi.fn(),
  carveInnerPolygon: vi.fn(),
  expandWithPolygon: vi.fn(),
  renamePolygon: vi.fn(),
  validateDraft: vi.fn(),
  resolveOverlapsWithDraft: vi.fn(),
  undo: vi.fn().mockResolvedValue(undefined),
  redo: vi.fn().mockResolvedValue(undefined),
  canUndo: vi.fn().mockReturnValue(false),
  canRedo: vi.fn().mockReturnValue(false),
});

// RegionBindingAPI の最小モック
const createMockRegionAPI = () => ({
  BindPolygonToArea: vi.fn().mockResolvedValue(undefined),
  UnbindPolygonFromArea: vi.fn().mockResolvedValue(undefined),
});

const makeDraft = (closed: boolean): DraftShape => ({
  points: [
    { lat: 35.776, lng: 140.318 },
    { lat: 35.777, lng: 140.319 },
    { lat: 35.778, lng: 140.32 },
  ],
  isClosed: closed,
});

const makePolygon = (id: string, name: string): MapPolygon =>
  ({
    id: id as unknown as PolygonID,
    geometry: {
      type: "Polygon" as const,
      coordinates: [
        [
          [140.318, 35.776],
          [140.319, 35.777],
          [140.32, 35.778],
          [140.318, 35.776],
        ],
      ],
    },
    display_name: name,
    parent_id: null,
    metadata: {},
    created_at: new Date(),
    updated_at: new Date(),
  }) as MapPolygon;

describe("PolygonService", () => {
  let editor: ReturnType<typeof createMockEditor>;
  let regionAPI: ReturnType<typeof createMockRegionAPI>;
  let service: PolygonService;

  beforeEach(() => {
    editor = createMockEditor();
    regionAPI = createMockRegionAPI();
    service = new PolygonService(editor as any, regionAPI);
  });

  describe("savePolygonForArea", () => {
    it("ドラフトをポリゴンとして保存し、区域に紐付ける", async () => {
      const draft = makeDraft(true);
      const savedPolygon = makePolygon("poly-123", "NRT-001-01");
      editor.saveAsPolygon.mockResolvedValue(savedPolygon);

      const result = await service.savePolygonForArea(
        draft,
        "NRT-001-01",
        "NRT-001-01",
      );

      expect(editor.saveAsPolygon).toHaveBeenCalledWith(draft, "NRT-001-01");
      expect(regionAPI.BindPolygonToArea).toHaveBeenCalledWith(
        "NRT-001-01",
        "poly-123",
      );
      expect(result).toBe(savedPolygon);
    });

    it("クローズされていないドラフトではエラーをスローする", async () => {
      const draft = makeDraft(false);

      await expect(
        service.savePolygonForArea(draft, "NRT-001-01", "NRT-001-01"),
      ).rejects.toThrow();
    });

    it("saveAsPolygon失敗時はBindPolygonToAreaを呼ばない", async () => {
      const draft = makeDraft(true);
      editor.saveAsPolygon.mockRejectedValue(new Error("save failed"));

      await expect(
        service.savePolygonForArea(draft, "NRT-001-01", "NRT-001-01"),
      ).rejects.toThrow("save failed");
      expect(regionAPI.BindPolygonToArea).not.toHaveBeenCalled();
    });
  });

  describe("deletePolygonForArea", () => {
    it("ポリゴンを削除し、区域の紐付けを解除する", async () => {
      await service.deletePolygonForArea(
        "poly-123" as unknown as PolygonID,
        "NRT-001-01",
      );

      expect(editor.deletePolygon).toHaveBeenCalledWith("poly-123");
      expect(regionAPI.UnbindPolygonFromArea).toHaveBeenCalledWith(
        "NRT-001-01",
      );
    });
  });

  describe("getAllPolygons", () => {
    it("エディタから全ポリゴンを返す", () => {
      const polygons = [makePolygon("p1", "A"), makePolygon("p2", "B")];
      editor.getAllPolygons.mockReturnValue(polygons);

      expect(service.getAllPolygons()).toEqual(polygons);
    });
  });

  describe("buildPolygonAreaMap", () => {
    it("ポリゴンIDから区域情報へのマップを返す", () => {
      const tree = [
        {
          id: "NRT",
          name: "成田",
          symbol: "NRT",
          parentAreas: [
            {
              id: "NRT-001",
              number: "001",
              name: "唐部",
              areas: [
                { id: "NRT-001-01", number: "01", polygonId: "poly-a" },
                { id: "NRT-001-02", number: "02" }, // polygonId なし
              ],
            },
          ],
        },
        {
          id: "TKY",
          name: "東京",
          symbol: "TKY",
          parentAreas: [
            {
              id: "TKY-001",
              number: "001",
              name: "渋谷",
              areas: [{ id: "TKY-001-01", number: "01", polygonId: "poly-b" }],
            },
          ],
        },
      ];

      const result = buildPolygonAreaMap(tree);

      expect(result.size).toBe(2);
      expect(result.get("poly-a")).toEqual({
        areaId: "NRT-001-01",
        areaLabel: "NRT-001-01",
      });
      expect(result.get("poly-b")).toEqual({
        areaId: "TKY-001-01",
        areaLabel: "TKY-001-01",
      });
    });

    it("ポリゴンが紐づいていない場合は空マップを返す", () => {
      const tree = [
        {
          id: "NRT",
          name: "成田",
          symbol: "NRT",
          parentAreas: [
            {
              id: "NRT-001",
              number: "001",
              name: "唐部",
              areas: [{ id: "NRT-001-01", number: "01" }],
            },
          ],
        },
      ];

      const result = buildPolygonAreaMap(tree);
      expect(result.size).toBe(0);
    });

    it("空ツリーでは空マップを返す", () => {
      const result = buildPolygonAreaMap([]);
      expect(result.size).toBe(0);
    });
  });

  describe("splitPolygon", () => {
    it("splitPolygonを呼び出して分割結果を返す", async () => {
      const poly1 = makePolygon("split-1", "part-A");
      const poly2 = makePolygon("split-2", "part-B");
      editor.splitPolygon.mockResolvedValue([poly1, poly2]);

      const openDraft: DraftShape = {
        points: [
          { lat: 35.776, lng: 140.318 },
          { lat: 35.777, lng: 140.319 },
        ],
        isClosed: false,
      };

      const result = await service.splitPolygon(
        "poly-a" as unknown as PolygonID,
        openDraft,
      );

      expect(editor.splitPolygon).toHaveBeenCalledWith("poly-a", openDraft);
      expect(result).toEqual([poly1, poly2]);
    });

    it("分割失敗時（交差なし）は空配列を返す", async () => {
      editor.splitPolygon.mockResolvedValue([]);

      const openDraft: DraftShape = {
        points: [
          { lat: 35.776, lng: 140.318 },
          { lat: 35.777, lng: 140.319 },
        ],
        isClosed: false,
      };

      const result = await service.splitPolygon(
        "poly-a" as unknown as PolygonID,
        openDraft,
      );

      expect(result).toEqual([]);
    });
  });

  describe("bridgePolygon", () => {
    it("bridgePolygonsを呼び出してok:trueの結果を返す", async () => {
      const polygon = makePolygon("new-poly", "bridged");
      const bridgeResult: BridgeResult = { ok: true, polygon };
      editor.bridgePolygons.mockResolvedValue(bridgeResult);

      const bridgePath = [
        { lat: 35.777, lng: 140.319 },
        { lat: 35.778, lng: 140.32 },
      ];

      const result = await service.bridgePolygon(
        "poly-a" as unknown as PolygonID,
        0,
        "poly-a" as unknown as PolygonID,
        3,
        bridgePath,
        "test-bridge",
      );

      expect(editor.bridgePolygons).toHaveBeenCalledWith(
        "poly-a",
        0,
        "poly-a",
        3,
        bridgePath,
        "test-bridge",
      );
      expect(result).toBe(bridgeResult);
    });
  });

  describe("moveVertex", () => {
    it("sharedEdgeMoveを呼び出して変更されたポリゴンを返す", async () => {
      const modified1 = makePolygon("poly-a", "modified");
      const modified2 = makePolygon("poly-b", "neighbor");
      editor.sharedEdgeMove.mockResolvedValue([modified1, modified2]);

      const result = await service.moveVertex(
        "poly-a" as unknown as PolygonID,
        2,
        35.777,
        140.319,
      );

      expect(editor.sharedEdgeMove).toHaveBeenCalledWith(
        "poly-a",
        2,
        35.777,
        140.319,
      );
      expect(result).toEqual([modified1, modified2]);
    });

    it("共有頂点がない場合は対象ポリゴンのみ返す", async () => {
      const modified = makePolygon("poly-a", "modified");
      editor.sharedEdgeMove.mockResolvedValue([modified]);

      const result = await service.moveVertex(
        "poly-a" as unknown as PolygonID,
        0,
        35.776,
        140.318,
      );

      expect(result).toHaveLength(1);
    });
  });

  describe("insertVertex", () => {
    it("loadPolygonToDraft → insertPoint → updatePolygonGeometryを呼ぶ", async () => {
      const draft = makeDraft(true);
      editor.loadPolygonToDraft.mockReturnValue(draft);
      const updatedPolygon = makePolygon("poly-a", "updated");
      editor.updatePolygonGeometry.mockResolvedValue(updatedPolygon);

      const result = await service.insertVertex(
        "poly-a" as unknown as PolygonID,
        1,
        35.7775,
        140.3195,
      );

      expect(editor.loadPolygonToDraft).toHaveBeenCalledWith("poly-a");
      expect(editor.updatePolygonGeometry).toHaveBeenCalledWith(
        "poly-a",
        expect.objectContaining({
          points: expect.arrayContaining([
            expect.objectContaining({ lat: 35.7775, lng: 140.3195 }),
          ]),
        }),
      );
      expect(result).toBe(updatedPolygon);
    });
  });

  describe("findNearestVertex", () => {
    it("ライブラリのfindNearestVertexに委譲する", () => {
      const snapped = { lat: 35.776, lng: 140.318 };
      editor.findNearestVertex.mockReturnValue(snapped);

      const result = service.findNearestVertex(
        { lat: 35.7761, lng: 140.3181 },
        0.0002,
      );

      expect(editor.findNearestVertex).toHaveBeenCalledWith(
        { lat: 35.7761, lng: 140.3181 },
        0.0002,
      );
      expect(result).toBe(snapped);
    });

    it("近傍に頂点がなければnullを返す", () => {
      editor.findNearestVertex.mockReturnValue(null);

      const result = service.findNearestVertex(
        { lat: 35.8, lng: 140.4 },
        0.0002,
      );

      expect(result).toBeNull();
    });
  });

  describe("findEdgeIntersections", () => {
    it("交差点をp1からの距離順で返す", () => {
      const intersections = [
        { lat: 35.777, lng: 140.319 },
        { lat: 35.778, lng: 140.32 },
      ];
      editor.findEdgeIntersections.mockReturnValue(intersections);

      const result = service.findEdgeIntersections(
        { lat: 35.776, lng: 140.318 },
        { lat: 35.779, lng: 140.321 },
      );

      expect(editor.findEdgeIntersections).toHaveBeenCalledWith(
        { lat: 35.776, lng: 140.318 },
        { lat: 35.779, lng: 140.321 },
      );
      expect(result).toEqual(intersections);
    });

    it("交差がなければ空配列を返す", () => {
      editor.findEdgeIntersections.mockReturnValue([]);

      const result = service.findEdgeIntersections(
        { lat: 35.776, lng: 140.318 },
        { lat: 35.777, lng: 140.319 },
      );

      expect(result).toEqual([]);
    });
  });

  describe("carveInnerPolygon", () => {
    it("ポリゴン内に閉ループを描いて内側ポリゴンをくり抜く", async () => {
      const outer = makePolygon("poly-outer", "outer");
      const inner = makePolygon("poly-inner", "inner");
      editor.carveInnerPolygon.mockResolvedValue({ outer, inner });

      const loopPath = [
        { lat: 35.7765, lng: 140.3185 },
        { lat: 35.777, lng: 140.319 },
        { lat: 35.7775, lng: 140.3185 },
      ];

      const result = await service.carveInnerPolygon(
        "poly-a" as unknown as PolygonID,
        loopPath,
      );

      expect(editor.carveInnerPolygon).toHaveBeenCalledWith("poly-a", loopPath);
      expect(result).toEqual({ outer, inner });
    });

    it("ループがポリゴン外なら例外をスローする", async () => {
      editor.carveInnerPolygon.mockRejectedValue(
        new Error("Loop does not lie inside polygon"),
      );

      await expect(
        service.carveInnerPolygon("poly-a" as unknown as PolygonID, [
          { lat: 0, lng: 0 },
          { lat: 1, lng: 1 },
          { lat: 0, lng: 1 },
        ]),
      ).rejects.toThrow();
    });
  });

  describe("expandWithPolygon", () => {
    it("既存ポリゴンを外側パスで拡張する", async () => {
      const original = makePolygon("poly-a", "original");
      const added = makePolygon("poly-child", "child");
      editor.expandWithPolygon.mockResolvedValue({ original, added });

      const outerPath = [
        { lat: 35.779, lng: 140.321 },
        { lat: 35.78, lng: 140.322 },
        { lat: 35.779, lng: 140.323 },
      ];

      const result = await service.expandWithPolygon(
        "poly-a" as unknown as PolygonID,
        outerPath,
        "expanded-child",
      );

      expect(editor.expandWithPolygon).toHaveBeenCalledWith(
        "poly-a",
        outerPath,
        "expanded-child",
      );
      expect(result).toEqual({ original, added });
    });
  });

  describe("renamePolygon", () => {
    it("ポリゴンの表示名を変更する", async () => {
      const renamed = makePolygon("poly-a", "新しい名前");
      editor.renamePolygon.mockResolvedValue(renamed);

      const result = await service.renamePolygon(
        "poly-a" as unknown as PolygonID,
        "新しい名前",
      );

      expect(editor.renamePolygon).toHaveBeenCalledWith("poly-a", "新しい名前");
      expect(result.display_name).toBe("新しい名前");
    });
  });

  describe("validateDraft", () => {
    it("有効なドラフトに対して空配列を返す", () => {
      editor.validateDraft.mockReturnValue([]);

      const draft = makeDraft(true);
      const result = service.validateDraft(draft);

      expect(editor.validateDraft).toHaveBeenCalledWith(draft);
      expect(result).toEqual([]);
    });

    it("不正なドラフトに対してバイオレーションを返す", () => {
      const violations: GeometryViolation[] = [
        { code: "TOO_FEW_VERTICES" },
        { code: "SELF_INTERSECTION" },
      ];
      editor.validateDraft.mockReturnValue(violations);

      const draft: DraftShape = {
        points: [{ lat: 0, lng: 0 }],
        isClosed: true,
      };
      const result = service.validateDraft(draft);

      expect(result).toEqual(violations);
    });
  });

  describe("undo / redo", () => {
    it("undoをエディタに委譲する", async () => {
      await service.undo();
      expect(editor.undo).toHaveBeenCalled();
    });

    it("redoをエディタに委譲する", async () => {
      await service.redo();
      expect(editor.redo).toHaveBeenCalled();
    });

    it("canUndo/canRedoをエディタに委譲する", () => {
      editor.canUndo.mockReturnValue(true);
      editor.canRedo.mockReturnValue(false);

      expect(service.canUndo()).toBe(true);
      expect(service.canRedo()).toBe(false);
    });
  });

  describe("resolveOverlapsWithDraft", () => {
    it("ライブラリのresolveOverlapsWithDraftに委譲する", async () => {
      const modified = makePolygon("poly-a", "modified");
      const created1 = makePolygon("poly-new-1", "created-1");
      const remainingDraft: DraftShape = {
        points: [
          { lat: 35.779, lng: 140.321 },
          { lat: 35.78, lng: 140.322 },
          { lat: 35.779, lng: 140.323 },
        ],
        isClosed: true,
      };

      editor.resolveOverlapsWithDraft.mockResolvedValue({
        modified,
        created: [created1],
        remainingDrafts: [remainingDraft],
      });

      const draft: DraftShape = {
        points: [
          { lat: 35.776, lng: 140.319 },
          { lat: 35.776, lng: 140.321 },
          { lat: 35.778, lng: 140.321 },
          { lat: 35.778, lng: 140.319 },
        ],
        isClosed: true,
      };

      const result = await service.resolveOverlapsWithDraft(
        "poly-a" as unknown as PolygonID,
        draft,
      );

      expect(editor.resolveOverlapsWithDraft).toHaveBeenCalledWith(
        "poly-a",
        draft,
      );
      expect(result.modified).toBe(modified);
      expect(result.created).toEqual([created1]);
      expect(result.remainingDrafts).toEqual([remainingDraft]);
    });

    it("重なりがなければcreatedとremainingDraftsが空になる", async () => {
      const unchanged = makePolygon("poly-a", "unchanged");
      editor.resolveOverlapsWithDraft.mockResolvedValue({
        modified: unchanged,
        created: [],
        remainingDrafts: [],
      });

      const draft = makeDraft(true);

      const result = await service.resolveOverlapsWithDraft(
        "poly-a" as unknown as PolygonID,
        draft,
      );

      expect(result.modified).toBe(unchanged);
      expect(result.created).toEqual([]);
      expect(result.remainingDrafts).toEqual([]);
    });
  });

  describe("savePolygonResolvingOverlaps", () => {
    it("交差するポリゴンがあればresolveOverlapsWithDraftで分割して保存する", async () => {
      const existing = makePolygon("poly-1", "area-1");
      editor.getAllPolygons.mockReturnValue([existing]);

      // findEdgeIntersections: ドラフトの辺が既存ポリゴンと交差
      editor.findEdgeIntersections
        .mockReturnValueOnce([{ lat: 35.777, lng: 140.319 }]) // 辺1が交差
        .mockReturnValue([]); // 残りは交差しない

      const modified = makePolygon("poly-1", "modified");
      const created = makePolygon("poly-new", "created");
      editor.resolveOverlapsWithDraft.mockResolvedValue({
        modified,
        created: [created],
        remainingDrafts: [],
      });

      const draft: DraftShape = {
        points: [
          { lat: 35.776, lng: 140.319 },
          { lat: 35.776, lng: 140.321 },
          { lat: 35.778, lng: 140.321 },
          { lat: 35.778, lng: 140.319 },
        ],
        isClosed: true,
      };

      const result = await service.savePolygonResolvingOverlaps(
        draft,
        "new-area",
      );

      expect(editor.resolveOverlapsWithDraft).toHaveBeenCalledWith(
        "poly-1",
        expect.objectContaining({ isClosed: false }),
      );
      expect("created" in result && result.created).toContain(created);
    });

    it("交差するポリゴンがなければ通常のsaveAsPolygonで保存する", async () => {
      editor.getAllPolygons.mockReturnValue([]);
      editor.findEdgeIntersections.mockReturnValue([]);

      const newPoly = makePolygon("new-1", "new-area");
      editor.saveAsPolygon.mockResolvedValue(newPoly);

      const draft = makeDraft(true);

      const result = await service.savePolygonResolvingOverlaps(
        draft,
        "new-area",
      );

      expect(editor.saveAsPolygon).toHaveBeenCalledWith(draft, "new-area");
      expect(editor.resolveOverlapsWithDraft).not.toHaveBeenCalled();
      expect("saved" in result && result.saved).toBe(newPoly);
    });

    it("クローズされていないドラフトではエラーをスローする", async () => {
      const draft = makeDraft(false);
      await expect(
        service.savePolygonResolvingOverlaps(draft, "test"),
      ).rejects.toThrow();
    });
  });
});
