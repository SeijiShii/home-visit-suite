// 個人デバイス（自分の ID に紐づく端末）のドメインモデル。
// 同一ユーザーの各端末は同一 DID を共有し、deviceId で区別する。
// 仕様: docs/wants/01_共通基盤.md「個人デバイスの管理（設定画面）」
//
// 暫定は localStorage 保管（identity-service）。LinkSelf 同期（M5）で ScopeDevice の
// 同期リポジトリへ移行すると、他端末も一覧・削除できるようになる。

export interface Device {
  /** 端末固有のランダム ID（DID とは別。端末の識別に使う）。 */
  id: string;
  /** 所有ユーザーの DID。 */
  userId: string;
  /** 表示ラベル（例: PC / スマホ）。既定は空でユーザーが設定する。 */
  label: string;
  /** 登録日時（ISO 8601）。 */
  createdAt: string;
  /**
   * デバイスロスター由来の兄弟端末（この端末の登録簿ではなくロスターから
   * 表示している行）。改名は可（ラベルの SoT はロスター＝rev+1 再署名で
   * 全端末に同期）。削除は不可（ロスター失効は将来対応）。
   * docs/wants/01「デバイス一覧への反映」「ラベルの同期」。
   */
  fromRoster?: boolean;
}
