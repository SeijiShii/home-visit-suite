// 区域親番境界（親番グループの境目）の辺判定。
// 仕様: docs/wants/03_地図機能.md「区域親番境界の強調表示」

/** 区域ID（例: NRT-001-05）から親番キー（例: NRT-001）を取り出す。 */
export function areaParentKey(areaId: string): string {
  const i = areaId.lastIndexOf("-");
  return i > 0 ? areaId.slice(0, i) : areaId;
}

/**
 * 区域親番の境目となる辺IDの集合を返す。
 * 辺ごとに紐付け済みポリゴンの親番キーを集め、
 * - 片側にしか紐付け済みポリゴンが無い（親番グループの外周）
 * - 両側の親番が異なる
 * とき境目とみなす。同一親番内の共有辺は含めない。
 */
export function computeParentBoundaryEdges(
  polygons: ReadonlyArray<{ id: string; edgeIds: readonly string[] }>,
  polygonAreaIds: ReadonlyMap<string, string>,
): Set<string> {
  const ownerParents = new Map<string, string[]>();
  for (const p of polygons) {
    const areaId = polygonAreaIds.get(p.id);
    if (!areaId) continue;
    const parent = areaParentKey(areaId);
    for (const eid of p.edgeIds) {
      const list = ownerParents.get(eid);
      if (list) {
        list.push(parent);
      } else {
        ownerParents.set(eid, [parent]);
      }
    }
  }
  const result = new Set<string>();
  for (const [eid, parents] of ownerParents) {
    if (parents.length === 1 || new Set(parents).size >= 2) {
      result.add(eid);
    }
  }
  return result;
}
