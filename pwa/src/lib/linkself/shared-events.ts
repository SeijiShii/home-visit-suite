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
 * デバイスロスターの更新イベント名（detail なし）。ロスターの永続
 * （ペアリング統合・announce 統合・ラベル変更）のたびに発火し、開いている
 * 設定画面のデバイス一覧が再読み込みなしで追従する（docs/wants/01
 * 「ロスター更新の即時 UI 反映」）。
 */
export const ROSTER_UPDATED_EVENT = "hvs:roster-updated";
