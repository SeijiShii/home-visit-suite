// ブラウザ用 LinkSelf クライアント（@linkself/core）の組み立て。
// createInMemoryServices を LinkSelf-backed へ差し替える M5 統合の土台。
// ブラウザ制約によりトランスポートは WebSocket のみ（TCP/QUIC 不可）、
// 着信不可のため実運用では Circuit Relay v2 経由で疎通する（docs/wants/11 §2）。

import { noise } from "@chainsafe/libp2p-noise";
import { yamux } from "@chainsafe/libp2p-yamux";
import { circuitRelayTransport } from "@libp2p/circuit-relay-v2";
import { identify } from "@libp2p/identify";
import { webSockets } from "@libp2p/websockets";
import { createLibp2p, type Libp2p } from "libp2p";
import {
  LinkSelfClient,
  type Identity,
  type KnownPeer,
  type SignedRoster,
  type SqlDatabase,
} from "@linkself/core";

export interface CreateLinkSelfClientOptions {
  /**
   * この端末の device identity（Ed25519 + did:key）。libp2p host 鍵になり
   * peerId≡device DID。node の auth 署名にも使う（2層モデルの transport 層）。
   */
  identity: Identity;
  /**
   * アカウント（ユーザー）identity。ネットワーク公開・全端末で共有・ロスター署名に
   * 使う。省略時は identity を流用（単一端末＝アカウント＝端末が一致）。
   */
  userIdentity?: Identity;
  /**
   * ユーザー署名済みデバイスロスター。devicesync は載っている兄弟 device DID
   * のみを対象・受理する（ロスター＝信頼の起点）。
   */
  roster?: SignedRoster;
  /** FastStart 用の既知ピア（リレー/ブートストラップ・ペア済み端末）。 */
  knownPeers?: KnownPeer[];
  /**
   * MyDB の SQL 面のバックエンド（ブラウザは OPFS-backed SqliteWasmDatabase）。
   * 渡すと start() 後 `client.myDB` の SQL/KV が使える。SQL 書き込みは
   * devicesync にミラーされ端末間同期に乗る。省略時は KV のみ（永続なし）。
   */
  sqlDatabase?: SqlDatabase;
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
    // libp2p host 鍵 = device identity の鍵（peerId≡device DID）。
    privateKey: opts.identity.privateKey,
    // webSockets: リレー/ブートストラップへの直 dial（ブラウザは着信不可）。
    // circuitRelayTransport: リレー接続時に自動でスロットを予約し `/p2p-circuit`
    //   受信アドレスを得る＝ブラウザ同士が Circuit Relay v2 経由で相互到達できる
    //   （docs/wants/11 §2「Circuit Relay v2 クライアント対応」）。
    transports: [webSockets(), circuitRelayTransport()],
    connectionEncrypters: [noise()],
    streamMuxers: [yamux()],
    // identify: circuitRelayTransport が要求（リレーの hop 対応検出・アドレス交換に必要）。
    services: { identify: identify() },
    ...(opts.allowLocalDial
      ? { connectionGater: { denyDialMultiaddr: async () => false } }
      : {}),
  });
  const client = new LinkSelfClient({
    libp2p,
    identity: opts.identity,
    userIdentity: opts.userIdentity,
    roster: opts.roster,
    knownPeers: opts.knownPeers,
    sqlDatabase: opts.sqlDatabase,
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
