import { describe, it, expect, vi, beforeEach } from "vitest";
import { RegionService, type RegionBindingAPI } from "./region-service";

const createMockAPI = (): RegionBindingAPI => ({
  ListRegions: vi.fn().mockResolvedValue([]),
  SaveRegion: vi.fn().mockResolvedValue(undefined),
  DeleteRegion: vi.fn().mockResolvedValue(undefined),
  ListParentAreas: vi.fn().mockResolvedValue([]),
  ListAreas: vi.fn().mockResolvedValue([]),
});

describe("RegionService", () => {
  let api: ReturnType<typeof createMockAPI>;
  let service: RegionService;

  beforeEach(() => {
    api = createMockAPI();
    service = new RegionService(api);
  });

  describe("loadTree", () => {
    it("空のリポジトリから空ツリーを返す", async () => {
      const tree = await service.loadTree();
      expect(tree).toEqual([]);
      expect(api.ListRegions).toHaveBeenCalledOnce();
    });

    it("領域のみ（子なし）のツリーを構築する", async () => {
      (api.ListRegions as ReturnType<typeof vi.fn>).mockResolvedValue([
        { id: "NRT", name: "成田市", symbol: "NRT", approved: false },
      ]);

      const tree = await service.loadTree();

      expect(tree).toHaveLength(1);
      expect(tree[0]).toEqual({
        id: "NRT",
        name: "成田市",
        symbol: "NRT",
        parentAreas: [],
      });
      expect(api.ListParentAreas).toHaveBeenCalledWith("NRT");
    });

    it("領域→区域親番→区域の3階層ツリーを構築する", async () => {
      (api.ListRegions as ReturnType<typeof vi.fn>).mockResolvedValue([
        { id: "NRT", name: "成田市", symbol: "NRT", approved: true },
      ]);
      (api.ListParentAreas as ReturnType<typeof vi.fn>).mockResolvedValue([
        { id: "NRT-001", regionId: "NRT", number: "001", name: "加良部" },
      ]);
      (api.ListAreas as ReturnType<typeof vi.fn>).mockResolvedValue([
        { id: "NRT-001-01", parentAreaId: "NRT-001", number: "01" },
        { id: "NRT-001-02", parentAreaId: "NRT-001", number: "02" },
      ]);

      const tree = await service.loadTree();

      expect(tree).toHaveLength(1);
      expect(tree[0].parentAreas).toHaveLength(1);
      expect(tree[0].parentAreas[0].areas).toHaveLength(2);
      expect(tree[0].parentAreas[0].number).toBe("001");
      expect(tree[0].parentAreas[0].areas[0].number).toBe("01");
    });

    it("複数領域を正しく構築する", async () => {
      (api.ListRegions as ReturnType<typeof vi.fn>).mockResolvedValue([
        { id: "NRT", name: "成田市", symbol: "NRT", approved: true },
        { id: "SAK", name: "佐倉市", symbol: "SAK", approved: false },
      ]);

      const tree = await service.loadTree();

      expect(tree).toHaveLength(2);
      expect(tree[0].symbol).toBe("NRT");
      expect(tree[1].symbol).toBe("SAK");
      expect(api.ListParentAreas).toHaveBeenCalledTimes(2);
    });
  });

  describe("addRegion", () => {
    it("名前と記号を渡してSaveRegionを呼ぶ", async () => {
      await service.addRegion("成田市", "NRT");

      expect(api.SaveRegion).toHaveBeenCalledOnce();
      const savedRegion = (api.SaveRegion as ReturnType<typeof vi.fn>).mock
        .calls[0][0];
      expect(savedRegion.id).toBe("NRT");
      expect(savedRegion.name).toBe("成田市");
      expect(savedRegion.symbol).toBe("NRT");
      expect(savedRegion.approved).toBe(false);
    });

    it("API側エラーを伝播する", async () => {
      (api.SaveRegion as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error("duplicate id"),
      );

      await expect(service.addRegion("成田市", "NRT")).rejects.toThrow(
        "duplicate id",
      );
    });
  });

  describe("deleteRegion", () => {
    it("指定IDでDeleteRegionを呼ぶ", async () => {
      await service.deleteRegion("NRT");

      expect(api.DeleteRegion).toHaveBeenCalledWith("NRT");
    });
  });
});
