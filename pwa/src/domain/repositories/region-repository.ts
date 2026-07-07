// 領域・区域親番・区域の永続化インターフェース。
// 参照実装: shared/domain/repository.go（RegionRepository）
// delete* は論理削除（deletedAt にタイムスタンプ設定）。
// 復元（Restore）はアプリケーション層の責務（getRaw → deletedAt 除去 → save）。

import type { Area, ParentArea, Region } from "../models/region";

export interface RegionRepository {
  // 領域
  listRegions(): Promise<Region[]>;
  getRegion(id: string): Promise<Region | null>;
  /** DeletedAt 状態に関係なく取得 */
  getRegionRaw(id: string): Promise<Region | null>;
  saveRegion(region: Region): Promise<void>;
  deleteRegion(id: string): Promise<void>;
  /** 物理削除（ID変更時に使用） */
  removeRegion(id: string): Promise<void>;

  // 区域親番
  listParentAreas(regionId: string): Promise<ParentArea[]>;
  getParentArea(id: string): Promise<ParentArea | null>;
  getParentAreaRaw(id: string): Promise<ParentArea | null>;
  saveParentArea(pa: ParentArea): Promise<void>;
  deleteParentArea(id: string): Promise<void>;
  removeParentArea(id: string): Promise<void>;

  // 区域
  listAreas(parentAreaId: string): Promise<Area[]>;
  getArea(id: string): Promise<Area | null>;
  getAreaRaw(id: string): Promise<Area | null>;
  saveArea(area: Area): Promise<void>;
  deleteArea(id: string): Promise<void>;
  removeArea(id: string): Promise<void>;
}
