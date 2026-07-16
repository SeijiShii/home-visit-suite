// ロスターメールボックス同期の純ロジック（docs/wants/01「ロスターメールボックス」・
// link-self spec network-invitation.md §7.6）。transport の生成（user-mailbox.ts）と
// 分離してテスト可能にする。
//
// fetch した最新ロスターを自ロスターへ統合する。統合は setLabel/removeDevice と
// 同じリベースループ（host.commit が false = 別経路の announce 統合が割り込んだ
// → 最新の base で merge をやり直す）で、古いスナップショット由来の統合結果が
// 進んだ currentRoster を巻き戻さないことを保証する。
// 最後に必ず deposit して TTL（14 日）を更新する（spec §7.6「起動のたびに更新」。
// deposit は他端末へ通知されないためピンポンは構造的に起きず、積み上がった
// 旧封筒は次の fetch の GC が整理する）。

import {
  mergeSiblingRoster,
  rosterHasTombstone,
  type Identity,
  type SignedRoster,
} from "@linkself/core";

/** メールボックス操作の注入面（実体は roster-mailbox.ts + transport）。 */
export interface RosterMailboxOps {
  fetchLatest(): Promise<SignedRoster | null>;
  deposit(roster: SignedRoster): Promise<void>;
}

/** 呼び出し側（linkself-services）のロスター状態への注入面。 */
export interface RosterSyncHost {
  /** 現在のロスター（announce 統合で随時進む可変参照を読む）。 */
  getCurrent(): SignedRoster;
  /**
   * 統合結果を採用する（現在値の交換 + 永続を同期的に行う）。
   * base が最新でなくなっていたら false（呼び出し元はリベースして再試行）。
   */
  commit(base: SignedRoster, merged: SignedRoster): boolean;
  /** 統合結果に自デバイスの失効（tombstone）が含まれるとき呼ばれる（全初期化）。 */
  onRevoked(merged: SignedRoster): void;
  /** 自デバイス DID（失効判定用）。 */
  selfDeviceDID: string;
  /** ワイプ開始等で同期を打ち切るべきか。 */
  isAborted(): boolean;
}

export interface RosterMailboxSyncResult {
  /** 統合で自ロスターが変わったときの新ロスター（変化なし・打ち切りは null）。 */
  applied: SignedRoster | null;
  /** この同期で deposit したか（打ち切り時のみ false）。 */
  deposited: boolean;
}

/**
 * メールボックスと自ロスターを双方向に収束させる。
 * applied の client への反映（updateRoster・新規兄弟への redial）は呼び出し側の
 * 責務。失効（自分の tombstone）は host.onRevoked に委譲し、以後何もしない。
 */
export async function syncRosterWithMailbox(
  userIdentity: Identity,
  ops: RosterMailboxOps,
  host: RosterSyncHost,
): Promise<RosterMailboxSyncResult> {
  const fetched = await ops.fetchLatest();
  let applied: SignedRoster | null = null;
  if (fetched) {
    for (;;) {
      if (host.isAborted()) return { applied: null, deposited: false };
      const base = host.getCurrent();
      const merged = await mergeSiblingRoster(userIdentity, base, fetched);
      if (merged == null) break; // 変化なし（base が既に新しい）
      if (rosterHasTombstone(merged, host.selfDeviceDID)) {
        host.onRevoked(merged);
        return { applied: null, deposited: false };
      }
      if (!host.commit(base, merged)) continue; // 統合が割り込んだ → リベース
      applied = merged;
      break;
    }
  }
  if (host.isAborted()) return { applied, deposited: false };
  await ops.deposit(host.getCurrent());
  return { applied, deposited: true };
}
