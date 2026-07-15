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
  type ConsumedNonceStore,
  type EpochStore,
  type Identity,
  type JoinResponse,
  type KnownPeer,
  type MemberJoinedInfo,
  type NetworkStore,
  type RoleDefs,
  type SharedRecord,
  type SharedStorage,
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
  /** 自アカウントのロスターが announce 統合で更新されたときの永続フック。 */
  onRosterUpdated?: (roster: SignedRoster) => void;
  /** FastStart 用の既知ピア（リレー/ブートストラップ・ペア済み端末）。 */
  knownPeers?: KnownPeer[];
  /**
   * MyDB の SQL 面のバックエンド（ブラウザは OPFS-backed SqliteWasmDatabase）。
   * 渡すと start() 後 `client.myDB` の SQL/KV が使える。SQL 書き込みは
   * devicesync にミラーされ端末間同期に乗る。省略時は KV のみ（永続なし）。
   */
  sqlDatabase?: SqlDatabase;
  /**
   * ロール階層（admin/editor/member 等）。ネットワーク管理・グループ招待の
   * 権限判定（RoleDAG）に使う。省略時は空 DAG（"members" のみ有効）。
   */
  roles?: RoleDefs;
  /** ネットワーク管理に必要なロール（既定 "admin"）。 */
  adminRole?: string;
  /**
   * loopback/private アドレスへの dial を許可する（ローカル Go ノード相手の
   * 開発時のみ true）。ブラウザは既定でローカルネットワーク保護により
   * これらを拒否する。本番は公開リレー宛なので false（既定）で良い。
   */
  allowLocalDial?: boolean;
  /**
   * 参加受理（管理者側）のアプリ層ブリッジ。displayName は受理した管理者
   * しか見えないため、メンバー表（UserRepository）への記録はここで行う。
   */
  onMemberJoined?: (info: MemberJoinedInfo) => void | Promise<void>;
  /**
   * ネットワーク実体（メンバー・ロール表）のストア。省略時は in-memory で
   * リロードごとに消えるため、本番配線では永続実装を渡すこと。
   */
  networkStore?: NetworkStore;
  /** 使用済み招待ノンス表（単回使用の担保）。省略時は in-memory。 */
  consumedNonces?: ConsumedNonceStore;
  /**
   * 非同期参加用のメールボックス（常時稼働ノード。通常はリレーと同一）。
   * depositJoinRequest / checkMailbox が使う（docs/wants/04「非同期参加」）。
   */
  mailboxes?: KnownPeer[];
  /**
   * 被招待者側: 成立待ち（registerPendingJoin 済み）の参加への受理結果が
   * checkMailbox で検証・適用されたときに呼ばれる。ok:false もあり得る。
   */
  onAsyncJoinDecision?: (
    nonce: string,
    response: JoinResponse,
  ) => void | Promise<void>;
  /**
   * groupshare 共有レコードのストア。省略時は in-memory でリロードごとに消え、
   * catch-up の高水位・LWW 判定材料を失うため、本番配線では永続実装を渡すこと。
   */
  sharedStorage?: SharedStorage;
  /** membership epoch の永続ストア（巻き戻り防止）。省略時は in-memory。 */
  epochStore?: EpochStore;
  /**
   * ScopeNetwork テーブルへの受信レコード適用後に呼ばれる（Phase C）。
   * アプリの UI 更新フック。
   */
  onSharedApplied?: (table: string, rec: SharedRecord) => void | Promise<void>;
}

/** 起動済み LinkSelf セッション。stop() で graceful に libp2p を停止する。 */
export interface LinkSelfSession {
  client: LinkSelfClient;
  libp2p: Libp2p;
  /**
   * graceful stop。ページ破棄（pagehide）時に libp2p を停止する
   * （docs/wants/11 §2 ライフサイクル。hidden では停止しない = main.tsx）。
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
    // listen '/p2p-circuit': これが無いと circuitRelayTransport は予約を
    // 要求せず、リレーに接続しても /p2p-circuit 受信アドレスを得られない
    // （= selfAddrs() が空のままでグループ招待の発行が常に失敗する）。
    // 本番リレーへの live テストで確認（link-self ts/linkself/test/live-relay.e2e.test.ts）。
    addresses: { listen: ["/p2p-circuit"] },
    // webSockets: リレー/ブートストラップへの直 dial（ブラウザは着信不可）。
    // circuitRelayTransport: リレー接続時にスロットを予約し `/p2p-circuit`
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
    onRosterUpdated: opts.onRosterUpdated,
    knownPeers: opts.knownPeers,
    sqlDatabase: opts.sqlDatabase,
    roles: opts.roles,
    adminRole: opts.adminRole,
    onMemberJoined: opts.onMemberJoined,
    networkStore: opts.networkStore,
    consumedNonces: opts.consumedNonces,
    mailboxes: opts.mailboxes,
    onAsyncJoinDecision: opts.onAsyncJoinDecision,
    sharedStorage: opts.sharedStorage,
    epochStore: opts.epochStore,
    onSharedApplied: opts.onSharedApplied,
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
