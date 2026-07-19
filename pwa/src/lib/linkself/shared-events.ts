// ScopeNetwork テーブルへの受信レコード適用を UI に知らせる window イベント。
// linkself-services（動的 import・重量級）に依存せず購読できるよう、定数だけを
// 軽量モジュールに分離する（UsersPage / IdentityContext が購読）。

/** 受信適用イベント名。detail は {@link SharedAppliedDetail}。 */
export const SHARED_APPLIED_EVENT = "hvs:shared-applied";

export interface SharedAppliedDetail {
  /** 適用先の MyDB テーブル名（例: "users" / "member_tags"）。 */
  table: string;
}

/**
 * 画面が購読するテーブル群のプリセット（useSharedApplied に渡す）。
 * テーブル名は docs/wants/01「同期スコープ」表と group-schema.ts に一致させる。
 */
export const AREA_TREE_TABLES = ["regions", "parent_areas", "areas"] as const;
export const MAP_NETWORK_TABLES = [
  "map_vertices",
  "map_edges",
  "map_polygons",
] as const;
export const PLACE_TABLES = ["places"] as const;
export const CHECKOUT_TABLES = ["checkouts", "checkout_invitations"] as const;
export const VISIT_TABLES = ["visit_records", "visit_record_edits"] as const;
export const REQUEST_TABLES = ["requests"] as const;

/**
 * デバイスロスターの更新イベント名（detail なし）。ロスターの永続
 * （ペアリング統合・announce 統合・ラベル変更）のたびに発火し、開いている
 * 設定画面のデバイス一覧が再読み込みなしで追従する（docs/wants/01
 * 「ロスター更新の即時 UI 反映」）。
 */
export const ROSTER_UPDATED_EVENT = "hvs:roster-updated";

/**
 * 同期リペア要求イベント名（detail なし）。ロード時サニタイズ等がローカル DB の
 * 不整合（欠落行参照＝ライブ配送の取りこぼし疑い）を検出したときに発火し、
 * linkself-services がクールダウン付きで完全 catch-up（アンチエントロピー）を
 * 即時実行する（docs/wants/01「同期完全性の補完＝完全 catch-up」契機 (c)）。
 */
export const SYNC_REPAIR_REQUESTED_EVENT = "hvs:sync-repair-requested";

/** 同期リペアを要求する（LinkSelf 未配線時は購読者がおらず無害）。 */
export function requestSyncRepair(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(SYNC_REPAIR_REQUESTED_EVENT));
}
