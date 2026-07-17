// 頂点マージ等の編集操作後に、区域⇔ポリゴンの紐付けを整合させる補正を算出する
// 純ロジック。仕様: docs/wants/03「頂点ドラッグでの頂点統合（マージ）と退化
// ポリゴンの扱い」。
// - 分割で新 ID が発行されたポリゴン（ChangeSet.polygons.splitFrom）は、
//   分割元が区域に紐付いていれば同じ区域へ紐付ける（飛地として両方が属する）
// - 操作で消滅したポリゴン（polygons.removed）の紐付けは解除する

import type { ChangeSet } from "map-polygon-editor";

export interface BindingFixup {
  bind: Array<{ areaId: string; polygonId: string }>;
  unbind: Array<{ areaId: string; polygonId: string }>;
}

export function computeBindingFixup(
  cs: ChangeSet,
  areaOf: (polygonId: string) => string | undefined,
): BindingFixup {
  const fixup: BindingFixup = { bind: [], unbind: [] };
  for (const s of cs.polygons.splitFrom ?? []) {
    const areaId = areaOf(s.from as string);
    if (areaId) fixup.bind.push({ areaId, polygonId: s.id as string });
  }
  for (const removed of cs.polygons.removed) {
    const areaId = areaOf(removed as string);
    if (areaId) fixup.unbind.push({ areaId, polygonId: removed as string });
  }
  return fixup;
}
