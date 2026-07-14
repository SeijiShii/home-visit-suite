// 既知メンバー（主に招待発行者=管理者）の到達アドレス永続化。
// presence/発見（link-self b3）が無い現状、メンバー同士は自発的に再接続しないと
// 同期（catch-up / 即時配信）が成立しない。参加時に招待へ載っていた管理者の
// 到達アドレス（リレー circuit addr）を保存し、次回起動の FastStart 既知ピアに
// 混ぜることで「メンバー→管理者へ毎起動ダイヤル」のハブ型トポロジを成立させる。
// docs/wants/01「同期スコープ」実装ノート参照。

import type { KnownPeer } from "@linkself/core";

const KEY = "hvs.knownMembers";

function load(): Record<string, string[]> {
  try {
    const raw = localStorage.getItem(KEY);
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
    localStorage.setItem(KEY, JSON.stringify(map));
  } catch {
    // ignore
  }
}

/** 保存済みの既知メンバーを FastStart 用 KnownPeer[] として返す。 */
export function loadKnownMembers(): KnownPeer[] {
  return Object.entries(load()).map(([did, addrs]) => ({ did, addrs }));
}
