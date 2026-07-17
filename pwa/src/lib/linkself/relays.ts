// 常時稼働ノード（リレー兼メールボックス）アドレス設定の解析。
// linkself-services（重量級・動的 import）から独立させ、メールボックスだけを
// 使う軽量経路（フィードバック送受信等）からも読めるようにする。

import type { KnownPeer } from "@linkself/core";

/**
 * `did=multiaddr` をカンマ区切りで並べた文字列（VITE_LINKSELF_RELAYS）を
 * KnownPeer[] に解析する。同一 DID の複数アドレスはマージする。不正な要素は無視。
 * 例: "did:key:zAbc=/dns4/relay.example/tcp/443/wss/p2p/12D3.../p2p-circuit"
 */
export function parseRelays(raw: string | undefined): KnownPeer[] {
  const byDid = new Map<string, string[]>();
  for (const part of (raw ?? "").split(",")) {
    const entry = part.trim();
    if (entry === "") continue;
    const eq = entry.indexOf("=");
    if (eq < 0) continue;
    const did = entry.slice(0, eq).trim();
    const addr = entry.slice(eq + 1).trim();
    if (did === "" || addr === "") continue;
    const addrs = byDid.get(did);
    if (addrs) addrs.push(addr);
    else byDid.set(did, [addr]);
  }
  return [...byDid].map(([did, addrs]) => ({ did, addrs }));
}
