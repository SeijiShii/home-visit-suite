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
export function removeRoomRow(
  rows: readonly RoomRow[],
  key: string,
): RoomRow[] {
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
 * 部屋番号一致で復元すべき論理削除済み Room を探す。
 * 仕様: docs/wants/03「部屋（Room）の同番号復元」
 * - 同一 Building（parentId 一致）・`type='room'`・削除済みのうち、
 *   部屋番号（displayName、前後空白無視）が一致するもの
 * - 空欄はマッチング対象外
 * - 複数一致は deletedAt（ISO 文字列）が最新のもの
 */
export function findRestorableRoom(
  deletedRooms: readonly Place[],
  buildingId: string,
  displayName: string,
): Place | null {
  const name = displayName.trim();
  if (name.length === 0) return null;
  const candidates = deletedRooms.filter(
    (p) =>
      p.type === "room" &&
      p.parentId === buildingId &&
      !!p.deletedAt &&
      p.displayName.trim() === name,
  );
  if (candidates.length === 0) return null;
  return candidates.reduce((latest, p) =>
    (p.deletedAt ?? "") > (latest.deletedAt ?? "") ? p : latest,
  );
}

/**
 * 既存 Room 一覧から編集用の行リストを作る（0 件なら空行 1 つ）。
 * 集合住宅編集ダイアログと訪問ダイアログの部屋編集モードで共用する。
 */
export function buildRoomRows(rooms: readonly Place[] | undefined): RoomRow[] {
  if (!rooms || rooms.length === 0) return [makeRoomRow()];
  return [...rooms]
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((r) => ({
      key: `existing-${r.id}`,
      existingId: r.id,
      displayName: r.displayName,
    }));
}

/**
 * 行リストが編集開始時から変化していないか（existingId と displayName の
 * 並びで比較）。部屋編集モードの「変更なしなら保存しない／破棄確認を出さない」
 * 判定に使う（仕様 docs/wants/08）。
 */
export function roomRowsUnchanged(
  a: readonly RoomRow[],
  b: readonly RoomRow[],
): boolean {
  if (a.length !== b.length) return false;
  return a.every(
    (r, i) =>
      r.existingId === b[i].existingId && r.displayName === b[i].displayName,
  );
}

/** applyRoomRowsSave が必要とする保存サービスの最小 IF。 */
export interface RoomSaveService {
  savePlace: (place: Place) => Promise<unknown>;
  deletePlace?: (id: string) => Promise<void>;
  listDeletedRooms?: (buildingId: string) => Promise<Place[]>;
}

/**
 * 集合住宅編集ダイアログ／訪問ダイアログ部屋編集モードの行リストを
 * 差分適用で保存する。
 * 仕様: docs/wants/03「集合住宅の追加・編集」「部屋（Room）の同番号復元」
 *      docs/wants/08「集合住宅訪問ダイアログ」
 *
 * - 削除・変更の対象は baseExistingIds（編集開始時に行として提示した部屋）に
 *   限定する。編集中に同期受信で増えた部屋を「行に無い＝削除」と誤判定して
 *   巻き添え削除しないため（L-014）
 * - 削除を先に確定させてから復元候補（削除済み Room）を取得する。これにより
 *   同一保存内の「行削除＋同番号再追加」でも旧 Room が復元マッチし、
 *   訪問記録の紐付き（PlaceID）を失わない
 */
export async function applyRoomRowsSave(
  service: RoomSaveService,
  args: {
    /** 保存時点の当該 Building の未削除 Room（同期受信分を含んでよい） */
    existingRooms: readonly Place[];
    /** 編集開始時に行として提示した Room の ID 集合（差分適用のスコープ） */
    baseExistingIds: readonly string[];
    rows: readonly RoomRow[];
    buildingId: string;
    areaId: string;
  },
): Promise<void> {
  const base = new Set(args.baseExistingIds);
  const scopedExisting = args.existingRooms.filter((r) => base.has(r.id));
  const { toAdd, toUpdate, toDelete } = diffRoomRows(
    scopedExisting,
    args.rows,
    args.buildingId,
  );
  if (service.deletePlace) {
    for (const id of toDelete) {
      await service.deletePlace(id);
    }
  }
  // 追加行は同番号の削除済み Room があれば復元する。同番号行が複数ある場合に
  // 同じ Room を二重復元しないよう、消費済みを除外していく。
  let deletedRooms = service.listDeletedRooms
    ? await service.listDeletedRooms(args.buildingId).catch(() => [])
    : [];
  for (const r of toAdd) {
    const restorable = findRestorableRoom(
      deletedRooms,
      args.buildingId,
      r.displayName,
    );
    if (restorable) {
      deletedRooms = deletedRooms.filter((d) => d.id !== restorable.id);
      await service.savePlace({
        ...restorable,
        displayName: r.displayName,
        sortOrder: r.sortOrder,
        deletedAt: null,
      });
    } else {
      await service.savePlace({ ...r, areaId: args.areaId });
    }
  }
  for (const r of toUpdate) {
    await service.savePlace(r);
  }
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
    // 部屋番号は前後空白を除去して保存する（表示・復元マッチングとも trim 基準）
    const name = row.displayName.trim();
    const existing = row.existingId ? byId.get(row.existingId) : undefined;
    if (!existing) {
      const now = new Date().toISOString();
      toAdd.push({
        id: "",
        areaId: "", // 呼び出し側で上書きされる前提（Building の areaId を入れる）
        coord: { lat: 0, lng: 0 },
        type: "room",
        label: "",
        displayName: name,
        address: "",
        description: "",
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
    const changed = existing.displayName !== name || existing.sortOrder !== idx;
    if (changed) {
      toUpdate.push({
        ...existing,
        displayName: name,
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
