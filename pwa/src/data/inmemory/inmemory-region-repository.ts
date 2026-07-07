// RegionRepository のインメモリ実装。
// LinkSelf TS アダプタが完成するまでの開発・テスト用。
// list* / get* は論理削除済み（deletedAt あり）を除外し、getRaw* は含めて返す。

import type { Area, ParentArea, Region } from "../../domain/models/region";
import type { RegionRepository } from "../../domain/repositories/region-repository";

export class InMemoryRegionRepository implements RegionRepository {
  private regions = new Map<string, Region>();
  private parentAreas = new Map<string, ParentArea>();
  private areas = new Map<string, Area>();

  // --- 領域 ---

  async listRegions(): Promise<Region[]> {
    return [...this.regions.values()].filter((r) => !r.deletedAt).map((r) => ({ ...r }));
  }

  async getRegion(id: string): Promise<Region | null> {
    const r = this.regions.get(id);
    return r && !r.deletedAt ? { ...r } : null;
  }

  async getRegionRaw(id: string): Promise<Region | null> {
    const r = this.regions.get(id);
    return r ? { ...r } : null;
  }

  async saveRegion(region: Region): Promise<void> {
    this.regions.set(region.id, { ...region });
  }

  async deleteRegion(id: string): Promise<void> {
    const r = this.regions.get(id);
    if (r) {
      r.deletedAt = new Date().toISOString();
    }
  }

  async removeRegion(id: string): Promise<void> {
    this.regions.delete(id);
  }

  // --- 区域親番 ---

  async listParentAreas(regionId: string): Promise<ParentArea[]> {
    return [...this.parentAreas.values()]
      .filter((pa) => pa.regionId === regionId && !pa.deletedAt)
      .map((pa) => ({ ...pa }));
  }

  async getParentArea(id: string): Promise<ParentArea | null> {
    const pa = this.parentAreas.get(id);
    return pa && !pa.deletedAt ? { ...pa } : null;
  }

  async getParentAreaRaw(id: string): Promise<ParentArea | null> {
    const pa = this.parentAreas.get(id);
    return pa ? { ...pa } : null;
  }

  async saveParentArea(pa: ParentArea): Promise<void> {
    this.parentAreas.set(pa.id, { ...pa });
  }

  async deleteParentArea(id: string): Promise<void> {
    const pa = this.parentAreas.get(id);
    if (pa) {
      pa.deletedAt = new Date().toISOString();
    }
  }

  async removeParentArea(id: string): Promise<void> {
    this.parentAreas.delete(id);
  }

  // --- 区域 ---

  async listAreas(parentAreaId: string): Promise<Area[]> {
    return [...this.areas.values()]
      .filter((a) => a.parentAreaId === parentAreaId && !a.deletedAt)
      .map((a) => ({ ...a }));
  }

  async getArea(id: string): Promise<Area | null> {
    const a = this.areas.get(id);
    return a && !a.deletedAt ? { ...a } : null;
  }

  async getAreaRaw(id: string): Promise<Area | null> {
    const a = this.areas.get(id);
    return a ? { ...a } : null;
  }

  async saveArea(area: Area): Promise<void> {
    this.areas.set(area.id, { ...area });
  }

  async deleteArea(id: string): Promise<void> {
    const a = this.areas.get(id);
    if (a) {
      a.deletedAt = new Date().toISOString();
    }
  }

  async removeArea(id: string): Promise<void> {
    this.areas.delete(id);
  }
}
