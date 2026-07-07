import type { Place } from "../services/place-service";

/**
 * 区域詳細編集モードの場所一覧で使う並び順ヘルパ。
 * 仕様: docs/wants/03_地図機能.md「場所一覧サイドパネル」
 */

/**
 * 「全件の sortOrder が 0 で件数が 2 以上」の場合に初回採番が必要。
 * 単一要素や空配列は順序がそもそも定義できないので false。
 */
export function needsInitialAssignment(places: readonly Place[]): boolean {
  if (places.length < 2) return false;
  return places.every((p) => p.sortOrder === 0);
}

/**
 * CreatedAt 昇順 → id 昇順（tie-break）で 0..N-1 を採番し、
 * 新しい配列を返す。入力は変更しない。
 */
export function assignInitialSortOrder(places: readonly Place[]): Place[] {
  const sorted = [...places].sort((a, b) => {
    if (a.createdAt !== b.createdAt) {
      return a.createdAt < b.createdAt ? -1 : 1;
    }
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
  return sorted.map((p, idx) => ({ ...p, sortOrder: idx }));
}

/**
 * fromIndex から toIndex に移動して 0..N-1 を再採番した新しい配列を返す。
 * 入力配列・要素は変更しない。
 */
export function reorderPlaces(
  places: readonly Place[],
  fromIndex: number,
  toIndex: number,
): Place[] {
  if (
    fromIndex < 0 ||
    fromIndex >= places.length ||
    toIndex < 0 ||
    toIndex >= places.length
  ) {
    throw new RangeError(
      `reorderPlaces: out of range (from=${fromIndex}, to=${toIndex}, len=${places.length})`,
    );
  }
  const copy = [...places];
  if (fromIndex === toIndex) {
    return copy.map((p, idx) => ({ ...p, sortOrder: idx }));
  }
  const [moved] = copy.splice(fromIndex, 1);
  copy.splice(toIndex, 0, moved);
  return copy.map((p, idx) => ({ ...p, sortOrder: idx }));
}

/**
 * 新規場所追加時の sortOrder。既存の最大値 + 1（空なら 0）。
 */
export function nextSortOrder(places: readonly Place[]): number {
  if (places.length === 0) return 0;
  return Math.max(...places.map((p) => p.sortOrder)) + 1;
}
