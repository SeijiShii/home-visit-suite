// 同期状態の自己修復。docs/wants/01_共通基盤.md「同期状態の自己修復」参照。
//
// iOS/iPadOS の「ホーム画面に追加」は Safari タブと別のストレージコンテナを作り、
// localStorage は引き継ぐが OPFS は引き継がない（実機観測）。すると同期状態
// フラグ（scopedTables=初回一括配送済み / sharedRecords=catch-up 高水位）だけが
// 「同期済み」を主張し、空のグループ DB にデータが永遠に届かなくなる。
// グループ DB が新規（sqlite_master にテーブルが無い）なのにフラグが残っている
// 場合は、失われた旧 DB を記述する陳腐化データとみなして破棄する。
// membershipEpochs（巻き戻り防止）と networkId（再配線に必要）は保持する。

import { nsKey, repoPrefix } from "../group-slots";
import { LEGACY_MIGRATION_SOURCE_SUFFIXES } from "../../data/linkself/legacy-group-data-migration";

/** healDivergedSyncState が必要とする最小の DB 面（SqlDatabase の部分型）。 */
interface QueryableDb {
  query(
    sql: string,
    params?: unknown[],
  ): Promise<Array<Record<string, unknown>>>;
}

/** DB と食い違ったとき破棄する同期状態キー（スロット名前空間内）。 */
const STALE_SYNC_KEYS = ["scopedTables", "sharedRecords"] as const;

/**
 * グループ DB と localStorage の同期状態の食い違いを検出・修復する。
 * スキーマ適用（ensureGroupSchema）より前、DB を開いた直後に呼ぶこと
 * （適用後はテーブルが必ず存在し、新規 DB を判別できなくなる）。
 * in-memory フォールバック時は呼ばない（実 DB は別タブで健在のため）。
 *
 * @returns 修復（フラグ破棄）を行ったら true。判定不能（query 失敗）は
 *          誤破棄を避けるため false（フラグ保持）。
 */
export async function healDivergedSyncState(
  db: QueryableDb,
  slotId: string,
): Promise<boolean> {
  let tables: Array<Record<string, unknown>>;
  try {
    tables = await db.query(
      "SELECT name FROM sqlite_master WHERE type='table' LIMIT 1",
    );
  } catch {
    return false; // 判定不能。フラグは保持する
  }
  if (tables.length > 0) return false; // 既存 DB → フラグは正当

  const staleKeys = STALE_SYNC_KEYS.map((k) => nsKey(slotId, k));
  let hasStale = false;
  try {
    hasStale = staleKeys.some((k) => localStorage.getItem(k) != null);
  } catch {
    return false; // localStorage 不在（非ブラウザ）→ 修復対象なし
  }
  if (!hasStale) return false; // 真の新規インストール

  // 旧データ移行のソースキーも同世代の陳腐データとして一緒に破棄する。
  // 残すと「テーブルが空なら移行」が（この起動または将来の起動で）再発火し、
  // includeExisting の新タイムスタンプ一括配送でグループ全体を巻き戻す。
  // SQL 未移行で localStorage が現役のリポジトリは SUFFIXES に含まれず残る。
  const legacyKeys = LEGACY_MIGRATION_SOURCE_SUFFIXES.map(
    (suffix) => `${repoPrefix(slotId)}:${suffix}`,
  );
  for (const k of [...staleKeys, ...legacyKeys]) {
    try {
      localStorage.removeItem(k);
    } catch {
      // ignore
    }
  }
  console.warn(
    "linkself: group DB is empty but sync-state flags existed — cleared " +
      "stale flags to re-run initial share + full catch-up " +
      `(slot=${slotId}. partial storage copy, e.g. iOS Add-to-Home-Screen?)`,
  );
  return true;
}
