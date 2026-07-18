import type { AreaTreeNode } from "../services/region-service";

/** 選択ポリゴンに対応する区域ツリー上の祖先パス */
export interface AreaTreePath {
  regionId: string;
  parentAreaId: string;
  areaId: string;
}

/**
 * ポリゴンIDが紐付く区域をツリーから探し、展開すべき祖先パスを返す。
 * 未紐付け（どの区域にも含まれない）なら null。
 */
export function findAreaPathForPolygon(
  tree: AreaTreeNode[],
  polygonId: string,
): AreaTreePath | null {
  for (const region of tree) {
    for (const pa of region.parentAreas) {
      for (const area of pa.areas) {
        if (area.polygonIds?.includes(polygonId)) {
          return { regionId: region.id, parentAreaId: pa.id, areaId: area.id };
        }
      }
    }
  }
  return null;
}
