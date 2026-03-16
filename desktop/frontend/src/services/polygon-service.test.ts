import { describe, it, expect, vi, beforeEach } from "vitest";
import { PolygonService, buildPolygonAreaMap } from "./polygon-service";
import type {
  DraftShape,
  MapPolygon,
  PolygonID,
  BridgeResult,
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
});
