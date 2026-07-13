// ブラウザ用 LinkSelf クライアント（@linkself/core）の組み立て。
// createInMemoryServices を LinkSelf-backed へ差し替える M5 統合の土台。
// ブラウザ制約によりトランスポートは WebSocket のみ（TCP/QUIC 不可）、
// 着信不可のため実運用では Circuit Relay v2 経由で疎通する（docs/wants/11 §2）。

import { noise } from "@chainsafe/libp2p-noise";
import { yamux } from "@chainsafe/libp2p-yamux";
import { webSockets } from "@libp2p/websockets";
import { createLibp2p, type Libp2p } from "libp2p";
import { LinkSelfClient, type Identity, type KnownPeer } from "@linkself/core";

export interface CreateLinkSelfClientOptions {
  /** 自身の LinkSelf アイデンティティ（Ed25519 + did:key）。 */
  identity: Identity;
  /** FastStart 用の既知ピア（リレー/ブートストラップ・ペア済み端末）。 */
  knownPeers?: KnownPeer[];
  /**
   * loopback/private アドレスへの dial を許可する（ローカル Go ノード相手の
   * 開発時のみ true）。ブラウザは既定でローカルネットワーク保護により
   * これらを拒否する。本番は公開リレー宛なので false（既定）で良い。
   */
  allowLocalDial?: boolean;
}

/** 起動済み LinkSelf セッション。stop() で graceful に libp2p を停止する。 */
export interface LinkSelfSession {
  client: LinkSelfClient;
  libp2p: Libp2p;
  /**
   * graceful stop。ブラウザはバックグラウンド実行ゼロのため、前景→非表示
   * 遷移時に libp2p を停止する（docs/wants/11 §2 ライフサイクル）。
   */
  stop(): Promise<void>;
}

/**
 * ブラウザ用 LinkSelf クライアントを組み立てて start する。
 * 暗号化 = Noise、多重化 = yamux（Go 実装とワイヤ互換）。
 */
export async function createLinkSelfClient(
  opts: CreateLinkSelfClientOptions,
): Promise<LinkSelfSession> {
  const libp2p = await createLibp2p({
    privateKey: opts.identity.privateKey,
    transports: [webSockets()],
    connectionEncrypters: [noise()],
    streamMuxers: [yamux()],
    ...(opts.allowLocalDial
      ? { connectionGater: { denyDialMultiaddr: async () => false } }
      : {}),
  });
  const client = new LinkSelfClient({
    libp2p,
    identity: opts.identity,
    knownPeers: opts.knownPeers,
  });
  await client.start();
  return {
    client,
    libp2p,
    stop: async () => {
      await libp2p.stop();
    },
  };
}
