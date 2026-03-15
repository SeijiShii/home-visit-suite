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
});
