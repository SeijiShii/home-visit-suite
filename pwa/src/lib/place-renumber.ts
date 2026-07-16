// 区域内の場所の表示番号（SortOrder）重複検出と幾何順再採番の純ロジック。
// 仕様: docs/wants/03_地図機能.md「区域編集画面での場所表示と番号再採番 / 表示番号の重複と再採番」
// 区域の再編・統合・同期マージで生じた重複を、区域編集画面のロード時に
// 「上（北）→下、同緯度なら左（西）→右、同座標なら PlaceID 昇順」で
// 0..N-1 に正規化する。決定的・冪等（複数端末が同時に修復しても LWW で収束）。

import type { Place } from "../services/place-service";
import { needsInitialAssignment } from "./place-sort-order";

/** 再採番・重複判定の対象（一覧・バッジと同じ集合）: 未削除かつトップレベル（Room 除外）。 */
export function renumberTargets(places: readonly Place[]): Place[] {
  return places.filter((p) => !p.deletedAt && p.parentId === "");
}

/**
 * 対象集合内に同一 SortOrder が 2 件以上あるか。番号の欠落は重複ではない。
 * 全件が 0 の未初期化状態は「重複」扱いしない（初回採番は訪問記録画面の
 * CreatedAt 昇順規則＝既存仕様に委ねる。wants/03「表示番号の重複と再採番」）。
 */
export function hasDuplicateSortOrder(places: readonly Place[]): boolean {
  const targets = renumberTargets(places);
  if (needsInitialAssignment(targets)) return false;
  const seen = new Set<number>();
  for (const p of targets) {
    if (seen.has(p.sortOrder)) return true;
    seen.add(p.sortOrder);
  }
  return false;
}

/**
 * 対象場所を幾何順（緯度降順→経度昇順→PlaceID 昇順）で 0..N-1 に再採番し、
 * SortOrder が変わった場所だけを新しい値で返す（無変更の保存を避ける）。
 */
export function renumberByGeometry(places: readonly Place[]): Place[] {
  const targets = renumberTargets(places).sort(
    (a, b) =>
      b.coord.lat - a.coord.lat ||
      a.coord.lng - b.coord.lng ||
      (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
  );
  const changed: Place[] = [];
  targets.forEach((p, i) => {
    if (p.sortOrder !== i) changed.push({ ...p, sortOrder: i });
  });
  return changed;
}
