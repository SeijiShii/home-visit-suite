// 既知メンバー（主に招待発行者=管理者）の到達アドレス永続化。
// presence/発見（link-self b3）が無い現状、メンバー同士は自発的に再接続しないと
// 同期（catch-up / 即時配信）が成立しない。参加時に招待へ載っていた管理者の
// 到達アドレス（リレー circuit addr）を保存し、次回起動の FastStart 既知ピアに
// 混ぜることで「メンバー→管理者へ毎起動ダイヤル」のハブ型トポロジを成立させる。
// 保存先はアクティブなグループスロットの名前空間（既知メンバーはグループに属する。
// docs/wants/01「グループ毎のローカル DB 分離」）。スロット未作成時は旧単一キーへ
// フォールバックする。docs/wants/01「同期スコープ」実装ノート参照。

import type { KnownPeer } from "@linkself/core";
import { getActiveGroupSlot, nsKey } from "../group-slots";

const LEGACY_KEY = "hvs.knownMembers";

function storageKey(): string {
  const slot = getActiveGroupSlot();
  return slot ? nsKey(slot.slotId, "knownMembers") : LEGACY_KEY;
}

function load(): Record<string, string[]> {
  try {
    const raw = localStorage.getItem(storageKey());
    return raw ? (JSON.parse(raw) as Record<string, string[]>) : {};
  } catch {
    return {};
  }
}

/** 既知メンバーの到達アドレスを保存する（DID ごとに上書き）。 */
export function saveKnownMember(did: string, addrs: string[]): void {
  if (!did || addrs.length === 0) return;
  const map = load();
  map[did] = addrs;
  try {
    localStorage.setItem(storageKey(), JSON.stringify(map));
  } catch {
    // ignore
  }
}

/** 保存済みの既知メンバーを FastStart 用 KnownPeer[] として返す。 */
export function loadKnownMembers(): KnownPeer[] {
  return Object.entries(load()).map(([did, addrs]) => ({ did, addrs }));
}
