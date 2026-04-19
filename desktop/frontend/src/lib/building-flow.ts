import type { Place } from "../services/place-service";

/**
 * 集合住宅編集ダイアログの部屋行モデルと、保存時の差分計算ヘルパ。
 * 仕様: docs/wants/03_地図機能.md「集合住宅の追加・編集」
 */

export interface RoomRow {
  /** React list key。永続化されない一時 ID。 */
  key: string;
  /** 既存 Room の Place ID。新規追加行は null。 */
  existingId: string | null;
  /** 部屋番号（`Place.DisplayName`）。空欄可。 */
  displayName: string;
}

let roomKeySeq = 0;
function nextKey(): string {
  roomKeySeq += 1;
  return `room-row-${Date.now()}-${roomKeySeq}`;
}

/** 空の新規行を 1 つ作る（React list key 付き）。 */
export function makeRoomRow(): RoomRow {
  return { key: nextKey(), existingId: null, displayName: "" };
}

/** 末尾に n 行の空行を追加した新しい配列を返す。n<=0 は no-op。 */
export function addRoomRows(rows: readonly RoomRow[], n: number): RoomRow[] {
  if (n <= 0) return [...rows];
  const next: RoomRow[] = [...rows];
  for (let i = 0; i < n; i++) next.push(makeRoomRow());
  return next;
}

/**
 * key で行を削除した新しい配列を返す。
 * - 最後の 1 行は削除できない（行数最小 1 を保つ）
 * - 該当 key が無ければそのまま返す
 */
export function removeRoomRow(rows: readonly RoomRow[], key: string): RoomRow[] {
  if (rows.length <= 1) return [...rows];
  const idx = rows.findIndex((r) => r.key === key);
  if (idx < 0) return [...rows];
  const next = [...rows];
  next.splice(idx, 1);
  return next;
}

/** fromIndex から toIndex へ行移動した新しい配列を返す。 */
export function reorderRoomRows(
  rows: readonly RoomRow[],
  fromIndex: number,
  toIndex: number,
): RoomRow[] {
  if (
    fromIndex < 0 ||
    fromIndex >= rows.length ||
    toIndex < 0 ||
    toIndex >= rows.length
  ) {
    throw new RangeError(
      `reorderRoomRows: out of range (from=${fromIndex}, to=${toIndex}, len=${rows.length})`,
    );
  }
  if (fromIndex === toIndex) return [...rows];
  const next = [...rows];
  const [moved] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, moved);
  return next;
}

/**
 * 既存 Room と編集後の行リストを比較し、必要な保存アクションを返す。
 *
 * - toAdd: 新規作成する Place (`type='room'`, `parentId=buildingId`, `sortOrder=行index`)
 * - toUpdate: 既存 Room のうち sortOrder か displayName が変わったもの
 * - toDelete: 行から消えた既存 Room の ID
 */
export function diffRoomRows(
  existingRooms: readonly Place[],
  rows: readonly RoomRow[],
  buildingId: string,
): {
  toAdd: Place[];
  toUpdate: Place[];
  toDelete: string[];
} {
  const byId = new Map<string, Place>();
  for (const r of existingRooms) byId.set(r.id, r);

  const keptIds = new Set<string>();
  const toAdd: Place[] = [];
  const toUpdate: Place[] = [];

  rows.forEach((row, idx) => {
    const existing = row.existingId ? byId.get(row.existingId) : undefined;
    if (!existing) {
      const now = new Date().toISOString();
      toAdd.push({
        id: "",
        areaId: "", // 呼び出し側で上書きされる前提（Building の areaId を入れる）
        coord: { lat: 0, lng: 0 },
        type: "room",
        label: "",
        displayName: row.displayName,
        address: "",
        parentId: buildingId,
        sortOrder: idx,
        languages: [],
        doNotVisit: false,
        doNotVisitNote: "",
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
        restoredFromId: null,
      });
      return;
    }
    keptIds.add(existing.id);
    const changed =
      existing.displayName !== row.displayName || existing.sortOrder !== idx;
    if (changed) {
      toUpdate.push({
        ...existing,
        displayName: row.displayName,
        sortOrder: idx,
      });
    }
  });

  const toDelete: string[] = [];
  for (const r of existingRooms) {
    if (!keptIds.has(r.id)) toDelete.push(r.id);
  }

  return { toAdd, toUpdate, toDelete };
}
