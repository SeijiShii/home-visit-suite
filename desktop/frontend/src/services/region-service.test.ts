import { describe, it, expect, vi, beforeEach } from "vitest";
import { RegionService, type RegionBindingAPI } from "./region-service";

const createMockAPI = (): RegionBindingAPI => ({
  ListRegions: vi.fn().mockResolvedValue([]),
  SaveRegion: vi.fn().mockResolvedValue(undefined),
  DeleteRegion: vi.fn().mockResolvedValue(undefined),
  RestoreRegion: vi.fn().mockResolvedValue(undefined),
  ListParentAreas: vi.fn().mockResolvedValue([]),
  DeleteParentArea: vi.fn().mockResolvedValue(undefined),
  RestoreParentArea: vi.fn().mockResolvedValue(undefined),
  ListAreas: vi.fn().mockResolvedValue([]),
  DeleteArea: vi.fn().mockResolvedValue(undefined),
  RestoreArea: vi.fn().mockResolvedValue(undefined),
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

    it("APIがnullを返してもクラッシュしない", async () => {
      (api.ListRegions as ReturnType<typeof vi.fn>).mockResolvedValue([
        { id: "NRT", name: "成田市", symbol: "NRT", approved: false },
      ]);
      (api.ListParentAreas as ReturnType<typeof vi.fn>).mockResolvedValue(null);

      const tree = await service.loadTree();

      expect(tree).toHaveLength(1);
      expect(tree[0].parentAreas).toEqual([]);
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
    it("子なし領域を削除しDeleteCommandを返す", async () => {
      const cmd = await service.deleteRegion("NRT");

      expect(api.DeleteRegion).toHaveBeenCalledWith("NRT");
      expect(cmd).toEqual({
        type: "delete",
        targetType: "region",
        targetId: "NRT",
        entries: [{ entityType: "region", id: "NRT" }],
      });
    });

    it("子要素を持つ領域を削除すると子もすべて削除する", async () => {
      (api.ListParentAreas as ReturnType<typeof vi.fn>).mockResolvedValue([
        { id: "NRT-001", regionId: "NRT", number: "001", name: "加良部" },
      ]);
      (api.ListAreas as ReturnType<typeof vi.fn>).mockResolvedValue([
        { id: "NRT-001-01", parentAreaId: "NRT-001", number: "01" },
      ]);

      const cmd = await service.deleteRegion("NRT");

      expect(api.DeleteArea).toHaveBeenCalledWith("NRT-001-01");
      expect(api.DeleteParentArea).toHaveBeenCalledWith("NRT-001");
      expect(api.DeleteRegion).toHaveBeenCalledWith("NRT");
      expect(cmd.entries).toEqual([
        { entityType: "area", id: "NRT-001-01" },
        { entityType: "parentArea", id: "NRT-001" },
        { entityType: "region", id: "NRT" },
      ]);
    });
  });

  describe("deleteParentArea", () => {
    it("子の区域も削除する", async () => {
      (api.ListAreas as ReturnType<typeof vi.fn>).mockResolvedValue([
        { id: "NRT-001-01", parentAreaId: "NRT-001", number: "01" },
        { id: "NRT-001-02", parentAreaId: "NRT-001", number: "02" },
      ]);

      const cmd = await service.deleteParentArea("NRT-001");

      expect(api.DeleteArea).toHaveBeenCalledWith("NRT-001-01");
      expect(api.DeleteArea).toHaveBeenCalledWith("NRT-001-02");
      expect(api.DeleteParentArea).toHaveBeenCalledWith("NRT-001");
      expect(cmd.entries).toEqual([
        { entityType: "area", id: "NRT-001-01" },
        { entityType: "area", id: "NRT-001-02" },
        { entityType: "parentArea", id: "NRT-001" },
      ]);
    });
  });

  describe("deleteArea", () => {
    it("指定IDの区域を削除する", async () => {
      const cmd = await service.deleteArea("NRT-001-01");

      expect(api.DeleteArea).toHaveBeenCalledWith("NRT-001-01");
      expect(cmd).toEqual({
        type: "delete",
        targetType: "area",
        targetId: "NRT-001-01",
        entries: [{ entityType: "area", id: "NRT-001-01" }],
      });
    });
  });
});
