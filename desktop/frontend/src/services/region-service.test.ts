import { describe, it, expect, vi, beforeEach } from "vitest";
import { RegionService, type RegionBindingAPI } from "./region-service";

const createMockAPI = (): RegionBindingAPI => ({
  ListRegions: vi.fn().mockResolvedValue([]),
  SaveRegion: vi.fn().mockResolvedValue(undefined),
  DeleteRegion: vi.fn().mockResolvedValue(undefined),
  RestoreRegion: vi.fn().mockResolvedValue(undefined),
  ListParentAreas: vi.fn().mockResolvedValue([]),
  GetParentArea: vi.fn().mockResolvedValue({}),
  SaveParentArea: vi.fn().mockResolvedValue(undefined),
  DeleteParentArea: vi.fn().mockResolvedValue(undefined),
  RestoreParentArea: vi.fn().mockResolvedValue(undefined),
  ListAreas: vi.fn().mockResolvedValue([]),
  SaveArea: vi.fn().mockResolvedValue(undefined),
  DeleteArea: vi.fn().mockResolvedValue(undefined),
  RestoreArea: vi.fn().mockResolvedValue(undefined),
  ReorderRegions: vi.fn().mockResolvedValue(undefined),
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

  describe("addParentArea", () => {
    it("既存なしの場合、番号001でID=regionId-numberの親番区域を追加する", async () => {
      await service.addParentArea("NRT", "名前なし");

      expect(api.ListParentAreas).toHaveBeenCalledWith("NRT");
      expect(api.SaveParentArea).toHaveBeenCalledOnce();
      const saved = (api.SaveParentArea as ReturnType<typeof vi.fn>).mock
        .calls[0][0];
      expect(saved.id).toBe("NRT-001");
      expect(saved.regionId).toBe("NRT");
      expect(saved.number).toBe("001");
      expect(saved.name).toBe("名前なし");
    });

    it("既存の最大番号に+1した番号を付与する", async () => {
      (api.ListParentAreas as ReturnType<typeof vi.fn>).mockResolvedValue([
        { id: "NRT-001", regionId: "NRT", number: "001", name: "加良部" },
        { id: "NRT-003", regionId: "NRT", number: "003", name: "飯田" },
      ]);

      await service.addParentArea("NRT", "名前なし");

      const saved = (api.SaveParentArea as ReturnType<typeof vi.fn>).mock
        .calls[0][0];
      expect(saved.id).toBe("NRT-004");
      expect(saved.number).toBe("004");
    });
  });

  describe("addArea", () => {
    it("既存なしの場合、番号01でID=parentAreaId-numberの区域を追加する", async () => {
      await service.addArea("NRT-001");

      expect(api.ListAreas).toHaveBeenCalledWith("NRT-001");
      expect(api.SaveArea).toHaveBeenCalledOnce();
      const saved = (api.SaveArea as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(saved.id).toBe("NRT-001-01");
      expect(saved.parentAreaId).toBe("NRT-001");
      expect(saved.number).toBe("01");
    });

    it("既存の最大番号に+1した番号を付与する", async () => {
      (api.ListAreas as ReturnType<typeof vi.fn>).mockResolvedValue([
        { id: "NRT-001-01", parentAreaId: "NRT-001", number: "01" },
        { id: "NRT-001-05", parentAreaId: "NRT-001", number: "05" },
      ]);

      await service.addArea("NRT-001");

      const saved = (api.SaveArea as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(saved.id).toBe("NRT-001-06");
      expect(saved.number).toBe("06");
    });
  });

  describe("renameParentArea", () => {
    it("GetParentAreaで取得した親番区域の名前を変更してSaveする", async () => {
      (api.GetParentArea as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: "NRT-001",
        regionId: "NRT",
        number: "001",
        name: "旧名",
      });

      await service.renameParentArea("NRT-001", "新名");

      expect(api.GetParentArea).toHaveBeenCalledWith("NRT-001");
      expect(api.SaveParentArea).toHaveBeenCalledOnce();
      const saved = (api.SaveParentArea as ReturnType<typeof vi.fn>).mock
        .calls[0][0];
      expect(saved.name).toBe("新名");
      expect(saved.id).toBe("NRT-001");
    });
  });

  describe("isLastParentArea", () => {
    const region: import("./region-service").AreaTreeNode = {
      id: "NRT",
      name: "成田市",
      symbol: "NRT",
      parentAreas: [
        { id: "NRT-001", number: "001", name: "加良部", areas: [] },
        { id: "NRT-003", number: "003", name: "飯田", areas: [] },
      ],
    };

    it("最大番号のアイテムならtrueを返す", () => {
      expect(service.isLastParentArea(region, "NRT-003")).toBe(true);
    });

    it("最大番号でなければfalseを返す", () => {
      expect(service.isLastParentArea(region, "NRT-001")).toBe(false);
    });

    it("存在しないIDならfalseを返す", () => {
      expect(service.isLastParentArea(region, "NRT-999")).toBe(false);
    });
  });

  describe("isLastArea", () => {
    const parentArea = {
      areas: [
        { id: "NRT-001-01", number: "01" },
        { id: "NRT-001-05", number: "05" },
      ],
    };

    it("最大番号のアイテムならtrueを返す", () => {
      expect(service.isLastArea(parentArea, "NRT-001-05")).toBe(true);
    });

    it("最大番号でなければfalseを返す", () => {
      expect(service.isLastArea(parentArea, "NRT-001-01")).toBe(false);
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
