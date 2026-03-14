import { describe, it, expect, vi } from "vitest";
import { CommandExecutor } from "./command-executor";
import type { DeleteCommand } from "./command-history";
import type { RegionBindingAPI } from "./region-service";

const createMockAPI = (): RegionBindingAPI => ({
  ListRegions: vi.fn().mockResolvedValue([]),
  SaveRegion: vi.fn().mockResolvedValue(undefined),
  DeleteRegion: vi.fn().mockResolvedValue(undefined),
  RestoreRegion: vi.fn().mockResolvedValue(undefined),
  UpdateRegion: vi.fn().mockResolvedValue(undefined),
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
  BindPolygonToArea: vi.fn().mockResolvedValue(undefined),
  UnbindPolygonFromArea: vi.fn().mockResolvedValue(undefined),
});

describe("CommandExecutor", () => {
  describe("undo", () => {
    it("削除コマンドのundoで逆順にRestoreを呼ぶ（領域カスケード）", async () => {
      const api = createMockAPI();
      const executor = new CommandExecutor(api);
      const cmd: DeleteCommand = {
        type: "delete",
        targetType: "region",
        targetId: "NRT",
        entries: [
          { entityType: "area", id: "NRT-001-01" },
          { entityType: "parentArea", id: "NRT-001" },
          { entityType: "region", id: "NRT" },
        ],
      };

      await executor.undo(cmd);

      // 逆順: NRT → NRT-001 → NRT-001-01
      expect(api.RestoreRegion).toHaveBeenCalledWith("NRT");
      expect(api.RestoreParentArea).toHaveBeenCalledWith("NRT-001");
      expect(api.RestoreArea).toHaveBeenCalledWith("NRT-001-01");
    });

    it("区域親番削除のundoで正しいRestoreを呼ぶ", async () => {
      const api = createMockAPI();
      const executor = new CommandExecutor(api);
      const cmd: DeleteCommand = {
        type: "delete",
        targetType: "parentArea",
        targetId: "NRT-001",
        entries: [
          { entityType: "area", id: "NRT-001-01" },
          { entityType: "area", id: "NRT-001-02" },
          { entityType: "parentArea", id: "NRT-001" },
        ],
      };

      await executor.undo(cmd);

      expect(api.RestoreParentArea).toHaveBeenCalledWith("NRT-001");
      expect(api.RestoreArea).toHaveBeenCalledWith("NRT-001-01");
      expect(api.RestoreArea).toHaveBeenCalledWith("NRT-001-02");
    });

    it("単一区域削除のundoでRestoreAreaを呼ぶ", async () => {
      const api = createMockAPI();
      const executor = new CommandExecutor(api);
      const cmd: DeleteCommand = {
        type: "delete",
        targetType: "area",
        targetId: "NRT-001-01",
        entries: [{ entityType: "area", id: "NRT-001-01" }],
      };

      await executor.undo(cmd);

      expect(api.RestoreArea).toHaveBeenCalledWith("NRT-001-01");
    });
  });

  describe("redo", () => {
    it("削除コマンドのredoで順方向にDeleteを呼ぶ", async () => {
      const api = createMockAPI();
      const executor = new CommandExecutor(api);
      const cmd: DeleteCommand = {
        type: "delete",
        targetType: "region",
        targetId: "NRT",
        entries: [
          { entityType: "area", id: "NRT-001-01" },
          { entityType: "parentArea", id: "NRT-001" },
          { entityType: "region", id: "NRT" },
        ],
      };

      await executor.redo(cmd);

      expect(api.DeleteArea).toHaveBeenCalledWith("NRT-001-01");
      expect(api.DeleteParentArea).toHaveBeenCalledWith("NRT-001");
      expect(api.DeleteRegion).toHaveBeenCalledWith("NRT");
    });
  });

  describe("エラー伝播", () => {
    it("API側エラーを伝播する", async () => {
      const api = createMockAPI();
      (api.RestoreRegion as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error("restore failed"),
      );
      const executor = new CommandExecutor(api);
      const cmd: DeleteCommand = {
        type: "delete",
        targetType: "region",
        targetId: "NRT",
        entries: [{ entityType: "region", id: "NRT" }],
      };

      await expect(executor.undo(cmd)).rejects.toThrow("restore failed");
    });
  });
});
