// RegionRepository の LinkSelf(MyDB SQL) 実装。
// 領域/区域親番/区域を JSON 行テーブル（regions/parent_areas/areas）に保存する。
// ネットワーク配線時は ScopeNetwork で全メンバーへ伝播する（docs/wants/01「同期スコープ」）。
// list*/get* は論理削除済み（deletedAt あり）を除外し、getRaw* は含めて返す
// （InMemoryRegionRepository と同じ規約）。

import type { MyDB } from "@linkself/core";
import type { Area, ParentArea, Region } from "../../domain/models/region";
import type { RegionRepository } from "../../domain/repositories/region-repository";
import { deleteRow, getRow, listRows, putRow } from "./group-schema";

export class LinkSelfRegionRepository implements RegionRepository {
  constructor(private readonly db: MyDB) {}

  // --- 領域 ---

  async listRegions(): Promise<Region[]> {
    return (await listRows<Region>(this.db, "regions")).filter(
      (r) => !r.deletedAt,
    );
  }

  async getRegion(id: string): Promise<Region | null> {
    const r = await getRow<Region>(this.db, "regions", id);
    return r && !r.deletedAt ? r : null;
  }

  getRegionRaw(id: string): Promise<Region | null> {
    return getRow<Region>(this.db, "regions", id);
  }

  saveRegion(region: Region): Promise<void> {
    return putRow(this.db, "regions", region.id, region);
  }

  async deleteRegion(id: string): Promise<void> {
    const r = await getRow<Region>(this.db, "regions", id);
    if (r) {
      r.deletedAt = new Date().toISOString();
      await putRow(this.db, "regions", id, r);
    }
  }

  removeRegion(id: string): Promise<void> {
    return deleteRow(this.db, "regions", id);
  }

  // --- 区域親番 ---

  async listParentAreas(regionId: string): Promise<ParentArea[]> {
    return (await listRows<ParentArea>(this.db, "parent_areas")).filter(
      (pa) => pa.regionId === regionId && !pa.deletedAt,
    );
  }

  async getParentArea(id: string): Promise<ParentArea | null> {
    const pa = await getRow<ParentArea>(this.db, "parent_areas", id);
    return pa && !pa.deletedAt ? pa : null;
  }

  getParentAreaRaw(id: string): Promise<ParentArea | null> {
    return getRow<ParentArea>(this.db, "parent_areas", id);
  }

  saveParentArea(pa: ParentArea): Promise<void> {
    return putRow(this.db, "parent_areas", pa.id, pa);
  }

  async deleteParentArea(id: string): Promise<void> {
    const pa = await getRow<ParentArea>(this.db, "parent_areas", id);
    if (pa) {
      pa.deletedAt = new Date().toISOString();
      await putRow(this.db, "parent_areas", id, pa);
    }
  }

  removeParentArea(id: string): Promise<void> {
    return deleteRow(this.db, "parent_areas", id);
  }

  // --- 区域 ---

  async listAreas(parentAreaId: string): Promise<Area[]> {
    return (await listRows<Area>(this.db, "areas")).filter(
      (a) => a.parentAreaId === parentAreaId && !a.deletedAt,
    );
  }

  async getArea(id: string): Promise<Area | null> {
    const a = await getRow<Area>(this.db, "areas", id);
    return a && !a.deletedAt ? a : null;
  }

  getAreaRaw(id: string): Promise<Area | null> {
    return getRow<Area>(this.db, "areas", id);
  }

  saveArea(area: Area): Promise<void> {
    return putRow(this.db, "areas", area.id, area);
  }

  async deleteArea(id: string): Promise<void> {
    const a = await getRow<Area>(this.db, "areas", id);
    if (a) {
      a.deletedAt = new Date().toISOString();
      await putRow(this.db, "areas", id, a);
    }
  }

  removeArea(id: string): Promise<void> {
    return deleteRow(this.db, "areas", id);
  }
}
