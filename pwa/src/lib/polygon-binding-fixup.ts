// 頂点マージ等の編集操作後に、区域⇔ポリゴンの紐付けを整合させる補正を算出する
// 純ロジック。仕様: docs/wants/03「頂点ドラッグでの頂点統合（マージ）と退化
// ポリゴンの扱い」。
// - 分割で新 ID が発行されたポリゴン（ChangeSet.polygons.splitFrom）は、
//   分割元が区域に紐付いていれば同じ区域へ紐付ける（飛地として両方が属する）
// - 操作で消滅したポリゴン（polygons.removed）の紐付けは解除する
// 分割元が複数区域に紐付いている場合（N:M）は、その全区域が引き継ぎ・解除の
// 対象になる（wants 03「1 つのポリゴンへの複数区域紐付け」）。

import type { ChangeSet } from "map-polygon-editor";

export interface BindingFixup {
  bind: Array<{ areaId: string; polygonId: string }>;
  unbind: Array<{ areaId: string; polygonId: string }>;
}

export function computeBindingFixup(
  cs: ChangeSet,
  areasOf: (polygonId: string) => readonly string[] | undefined,
): BindingFixup {
  const fixup: BindingFixup = { bind: [], unbind: [] };
  for (const s of cs.polygons.splitFrom ?? []) {
    for (const areaId of areasOf(s.from as string) ?? []) {
      fixup.bind.push({ areaId, polygonId: s.id as string });
    }
  }
  for (const removed of cs.polygons.removed) {
    for (const areaId of areasOf(removed as string) ?? []) {
      fixup.unbind.push({ areaId, polygonId: removed as string });
    }
  }
  return fixup;
}
