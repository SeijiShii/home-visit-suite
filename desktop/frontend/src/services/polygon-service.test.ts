import { describe, it, expect, vi, beforeEach } from "vitest";
import { PolygonService, buildPolygonAreaMap } from "./polygon-service";
import type { PolygonSnapshot, NetworkPolygonEditor } from "map-polygon-editor";
import {
  createPolygonID,
  createEdgeID,
  emptyChangeSet,
} from "map-polygon-editor";

// NetworkPolygonEditor のモック
const createMockEditor = () => ({
  init: vi.fn().mockResolvedValue(undefined),
  save: vi.fn().mockResolvedValue(undefined),
  getMode: vi.fn().mockReturnValue("idle" as const),
  startDrawing: vi.fn(),
  endDrawing: vi.fn().mockReturnValue(emptyChangeSet()),
  placeVertex: vi.fn().mockReturnValue(emptyChangeSet()),
  snapToVertex: vi.fn().mockReturnValue(emptyChangeSet()),
  snapToEdge: vi.fn().mockReturnValue(emptyChangeSet()),
  moveVertex: vi.fn().mockReturnValue(emptyChangeSet()),
  removeVertex: vi.fn().mockReturnValue(emptyChangeSet()),
  removeEdge: vi.fn().mockReturnValue(emptyChangeSet()),
  splitEdge: vi.fn().mockReturnValue(emptyChangeSet()),
  canUndo: vi.fn().mockReturnValue(false),
  canRedo: vi.fn().mockReturnValue(false),
  undo: vi.fn().mockReturnValue(null),
  redo: vi.fn().mockReturnValue(null),
  getVertices: vi.fn().mockReturnValue([]),
  getEdges: vi.fn().mockReturnValue([]),
  getPolygons: vi.fn().mockReturnValue([]),
  getVertex: vi.fn().mockReturnValue(null),
  getEdge: vi.fn().mockReturnValue(null),
  findNearestVertex: vi.fn().mockReturnValue(null),
  findNearestEdge: vi.fn().mockReturnValue(null),
  getPolygonGeoJSON: vi.fn().mockReturnValue(null),
  getAllGeoJSON: vi
    .fn()
    .mockReturnValue({ type: "FeatureCollection", features: [] }),
});

// RegionBindingAPI の最小モック
const createMockRegionAPI = () => ({
  BindPolygonToArea: vi.fn().mockResolvedValue(undefined),
  UnbindPolygonFromArea: vi.fn().mockResolvedValue(undefined),
  RemapPolygonIds: vi.fn().mockResolvedValue(undefined),
});

const makePolygonSnapshot = (id: string): PolygonSnapshot => ({
  id: createPolygonID(id),
  edgeIds: [createEdgeID("e1"), createEdgeID("e2"), createEdgeID("e3")],
  holes: [],
});

describe("PolygonService", () => {
  let editor: ReturnType<typeof createMockEditor>;
  let regionAPI: ReturnType<typeof createMockRegionAPI>;
  let service: PolygonService;

  beforeEach(() => {
    editor = createMockEditor();
    regionAPI = createMockRegionAPI();
    service = new PolygonService(
      editor as unknown as NetworkPolygonEditor,
      regionAPI,
    );
  });

  describe("bindPolygonToArea", () => {
    it("ポリゴンIDと区域IDを紐付ける", async () => {
      await service.bindPolygonToArea(createPolygonID("poly-1"), "NRT-001-01");

      expect(regionAPI.BindPolygonToArea).toHaveBeenCalledWith(
        "NRT-001-01",
        "poly-1",
      );
    });
  });

  describe("unbindPolygonFromArea", () => {
    it("区域からポリゴン紐付けを解除する", async () => {
      await service.unbindPolygonFromArea("NRT-001-01");

      expect(regionAPI.UnbindPolygonFromArea).toHaveBeenCalledWith(
        "NRT-001-01",
      );
    });
  });

  describe("deletePolygonEdges", () => {
    it("ポリゴンの構成エッジを全て削除する", () => {
      const e1 = createEdgeID("e1");
      const e2 = createEdgeID("e2");
      const e3 = createEdgeID("e3");
      const snapshot: PolygonSnapshot = {
        id: createPolygonID("p1"),
        edgeIds: [e1, e2, e3],
        holes: [],
      };

      // 各 removeEdge が ChangeSet を返す
      const cs = emptyChangeSet();
      editor.removeEdge.mockReturnValue(cs);

      service.deletePolygonEdges(snapshot);

      expect(editor.removeEdge).toHaveBeenCalledTimes(3);
      expect(editor.removeEdge).toHaveBeenCalledWith(e1);
      expect(editor.removeEdge).toHaveBeenCalledWith(e2);
      expect(editor.removeEdge).toHaveBeenCalledWith(e3);
    });

    it("穴のエッジも含めて全削除する", () => {
      const e1 = createEdgeID("e1");
      const e2 = createEdgeID("e2");
      const holeE1 = createEdgeID("he1");
      const holeE2 = createEdgeID("he2");
      const snapshot: PolygonSnapshot = {
        id: createPolygonID("p1"),
        edgeIds: [e1, e2],
        holes: [[holeE1, holeE2]],
      };

      editor.removeEdge.mockReturnValue(emptyChangeSet());

      service.deletePolygonEdges(snapshot);

      expect(editor.removeEdge).toHaveBeenCalledTimes(4);
    });
  });

  describe("deletePolygonForArea", () => {
    it("ポリゴンのエッジを削除し、区域の紐付けを解除する", async () => {
      const snapshot = makePolygonSnapshot("poly-1");
      editor.removeEdge.mockReturnValue(emptyChangeSet());

      await service.deletePolygonForArea(snapshot, "NRT-001-01");

      expect(editor.removeEdge).toHaveBeenCalledTimes(3);
      expect(regionAPI.UnbindPolygonFromArea).toHaveBeenCalledWith(
        "NRT-001-01",
      );
    });
  });

  describe("save", () => {
    it("エディタのsaveに委譲する", async () => {
      await service.save();
      expect(editor.save).toHaveBeenCalled();
    });
  });

  describe("undo / redo", () => {
    it("undoをエディタに委譲しChangeSetを返す", () => {
      const cs = emptyChangeSet();
      editor.undo.mockReturnValue(cs);

      const result = service.undo();
      expect(editor.undo).toHaveBeenCalled();
      expect(result).toBe(cs);
    });

    it("redoをエディタに委譲する", () => {
      const cs = emptyChangeSet();
      editor.redo.mockReturnValue(cs);

      const result = service.redo();
      expect(editor.redo).toHaveBeenCalled();
      expect(result).toBe(cs);
    });

    it("canUndo/canRedoをエディタに委譲する", () => {
      editor.canUndo.mockReturnValue(true);
      editor.canRedo.mockReturnValue(false);

      expect(service.canUndo()).toBe(true);
      expect(service.canRedo()).toBe(false);
    });
  });

  describe("getPolygons / getPolygonGeoJSON", () => {
    it("全ポリゴンスナップショットを返す", () => {
      const polygons = [makePolygonSnapshot("p1"), makePolygonSnapshot("p2")];
      editor.getPolygons.mockReturnValue(polygons);

      expect(service.getPolygons()).toEqual(polygons);
    });

    it("指定IDのGeoJSONを返す", () => {
      const geo = {
        type: "Polygon" as const,
        coordinates: [
          [
            [140.318, 35.776],
            [140.319, 35.777],
            [140.32, 35.778],
            [140.318, 35.776],
          ],
        ],
      };
      editor.getPolygonGeoJSON.mockReturnValue(geo);

      const result = service.getPolygonGeoJSON(createPolygonID("p1"));
      expect(editor.getPolygonGeoJSON).toHaveBeenCalledWith(
        createPolygonID("p1"),
      );
      expect(result).toBe(geo);
    });
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
              { id: "NRT-001-02", number: "02" },
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
