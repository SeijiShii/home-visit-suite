// LinkSelf-backed のサービス束（ScopeDevice 先行スライス）。
//
// 現状スコープ:
// - 個人設定（my_settings / hidden_tips）を LinkSelf MyDB の SQL 面（ブラウザでは
//   OPFS SAHPool VFS の SQLite）に永続する。リロードをまたいで残る。
// - それ以外（regions/places/checkouts 等 = ScopeNetwork）は暫定の InMemory+localStorage
//   のまま。メンバー間共有は link-self Phase C（ScopeNetwork⇄groupshare）待ちのため
//   ここでは差し替えない（docs/wants/01_共通基盤.md「同期スコープ」）。
//
// 2 つの配線モード:
//  (1) スタンドアロン（既定）: リレー未設定 or identity 未作成のとき。libp2p を起動せず
//      OPFS-backed の MyDB を直接組む。設定はローカル永続するがネットワーク同期はしない。
//  (2) ネットワーク（seed + relays 指定時）: 実 identity で LinkSelfClient を起動し、
//      OPFS SQLite を SQL バックエンドに与えて `client.myDB` を使う。既知ピア（リレー/
//      ブートストラップ）へ FastStart 接続し、SQL 書き込みが devicesync に乗る。
//      接続先の常時稼働ノード（linkself-daemon）が要るため relays 指定時のみ有効化する。
//      ライフサイクルは前景起動 → graceful stop（docs/wants/11 §2）。stop() を返す。
//
// このモジュールは @linkself/core（sqlite-wasm 資産を含む）を引き込むため、
// フラグ ON 時に main.tsx から動的 import する（インメモリ起動では読み込まない）。

import {
  MemDeviceStorage,
  MyDB,
  ReplicationEngine,
  SqlProxy,
  SqliteWasmDatabase,
  identityFromPrivateKey,
  wireSqlSync,
  type KnownPeer,
} from "@linkself/core";
import type { RoleDefs } from "@linkself/core";
import { LinkSelfPersonalRepository } from "../data/linkself/linkself-personal-repository";
import { createLinkSelfClient } from "../lib/linkself/client-factory";
import { loadOrCreateDeviceTransportKey } from "../lib/linkself/device-key";
import { loadOrCreateRoster } from "../lib/linkself/device-roster";
import {
  GroupNetworkService,
  localStorageNetworkIdStore,
  upsertJoinedMember,
} from "../lib/linkself/group-network";
import {
  LocalStorageConsumedNonceStore,
  LocalStorageNetworkStore,
} from "../lib/linkself/network-store";
import { linkselfIdentityFromSeed } from "../lib/linkself/identity-bridge";
import { PersonalRepositorySettingsAdapter } from "../services/settings-binding-adapter";
import { SettingsService } from "../services/settings-service";
import {
  createInMemoryServices,
  type AppServices,
  type CreateServicesOptions,
} from "./ServicesContext";

/** 個人データ用 OPFS SQLite ファイル名（ブラウザは OPFS、テスト/node は in-memory）。 */
const PERSONAL_DB_FILENAME = "hvs-personal.db";

/**
 * home-visit-suite のロール階層（上位が下位を包含）。ネットワーク管理・グループ招待の
 * 権限判定（RoleDAG）に使う。docs/wants/04「メンバー権限は上位互換」。
 */
export const HVS_ROLES: RoleDefs = {
  admin: { includes: ["editor"] },
  editor: { includes: ["member"] },
  member: { includes: [] },
};

/** LinkSelf-backed サービス束。stop() で libp2p を graceful に停止する（非ネットワーク時は no-op）。 */
export interface LinkSelfServicesBundle {
  services: AppServices;
  /** 前景→非表示遷移やアンロード時に呼ぶ graceful stop（docs/wants/11 §2）。 */
  stop(): Promise<void>;
  /**
   * グループ招待/参加のファサード。ネットワーク配線が有効なときのみ提供される
   * （リレー未設定/スタンドアロンでは undefined）。
   */
  groupNetwork?: GroupNetworkService;
}

export interface CreateLinkSelfServicesOptions extends CreateServicesOptions {
  /** OPFS SQLite ファイル名の上書き（テスト用。省略時は本番既定名）。 */
  personalDbFilename?: string;
  /** 実 identity の 32byte Ed25519 シード。relays と併せて指定でネットワーク配線を有効化。 */
  seed?: Uint8Array;
  /** 既知ピア（リレー/ブートストラップ）。空/未指定ならネットワーク配線しない。 */
  relays?: KnownPeer[];
  /** ローカル daemon（127.0.0.1）相手の開発時に private 宛 dial を許可する。 */
  allowLocalDial?: boolean;
}

/**
 * スタンドアロンの OPFS-backed MyDB（KV=devicesync + SQL）を組む。libp2p は起動しない。
 * SQL 書き込みは wireSqlSync 経由で devicesync にミラーされる（本番配線と同じ）。
 * sqlDb は開場済みインスタンスを受け取る（OPFS SAHPool の Access Handle は排他の
 * ため、同一ファイルを二重に open してはならない）。
 */
async function openStandalonePersonalMyDB(
  sqlDb: SqliteWasmDatabase,
): Promise<MyDB> {
  const engine = new ReplicationEngine({
    storage: new MemDeviceStorage(),
    selfDID: "did:key:zlocal", // スタンドアロンは同期相手なし
    peers: async () => [],
    send: async () => {},
  });
  const proxy = await SqlProxy.open(sqlDb);
  wireSqlSync(proxy, engine);
  return new MyDB(engine, proxy);
}

/**
 * LinkSelf-backed のサービス束を構築する。個人設定のみ MyDB(OPFS SQL) に永続し、
 * 残りは createInMemoryServices の暫定実装を流用する。
 */
export async function createLinkSelfServices(
  opts: CreateLinkSelfServicesOptions = {},
): Promise<LinkSelfServicesBundle> {
  const base = createInMemoryServices(opts);
  const filename = opts.personalDbFilename ?? PERSONAL_DB_FILENAME;
  const useNetwork = opts.seed != null && (opts.relays?.length ?? 0) > 0;

  // OPFS SQLite は一度だけ開き、以降の全経路（ネットワーク/スタンドアロン/
  // 配線失敗フォールバック）で同一インスタンスを共有する。SAHPool の
  // Access Handle は排他のため、同一ファイルの二重 open は必ず失敗する。
  // 開けない場合（別タブが保持中など。多タブ直列化は未実装 = docs/wants/01）は
  // このタブに限り in-memory で起動し、アプリを起動不能にしない。
  let sqlDb: SqliteWasmDatabase;
  try {
    sqlDb = await SqliteWasmDatabase.open({ filename });
  } catch (e) {
    console.warn(
      "linkself: OPFS DB open failed (another tab holding the Access Handle?). " +
        "Falling back to in-memory for this tab — settings will not persist here.",
      e,
    );
    sqlDb = await SqliteWasmDatabase.open({ filename: ":memory:" });
  }

  let myDB: MyDB;
  let stop = async (): Promise<void> => {};
  let groupNetwork: GroupNetworkService | undefined;

  if (useNetwork) {
    try {
      // 2層 identity: userIdentity=アカウント（seed 由来・全端末共有）、
      // deviceIdentity=端末固有鍵（libp2p host 鍵, peerId≡device DID）。
      const userIdentity = await linkselfIdentityFromSeed(opts.seed!);
      const deviceIdentity = identityFromPrivateKey(
        await loadOrCreateDeviceTransportKey(),
      );
      // 自端末を登録した署名済みロスター（兄弟端末は接続時のロスター交換で収束）。
      const roster = await loadOrCreateRoster(userIdentity, deviceIdentity.did);
      const session = await createLinkSelfClient({
        identity: deviceIdentity,
        userIdentity,
        roster,
        knownPeers: opts.relays,
        sqlDatabase: sqlDb,
        roles: HVS_ROLES,
        allowLocalDial: opts.allowLocalDial,
        // 参加受理（管理者側）でメンバー表へ記録する（displayName はここでしか
        // 得られない）。一覧への他端末伝播は Phase C（ScopeNetwork 同期）待ち。
        onMemberJoined: (info) => upsertJoinedMember(base.userRepo, info),
        // ネットワーク実体と使用済みノンスはリロードをまたいで保持する
        // （in-memory だと発行済み招待が network_not_found で拒否される）。
        networkStore: new LocalStorageNetworkStore(),
        consumedNonces: new LocalStorageConsumedNonceStore(),
      });
      myDB = session.client.myDB;
      stop = session.stop;
      // グループ招待/参加ファサード（起動中の実 client で署名・参加できる）。
      groupNetwork = new GroupNetworkService(
        session.client,
        localStorageNetworkIdStore(),
      );
    } catch (e) {
      // ネットワーク配線失敗でアプリを起動不能にしない。ローカル永続へフォールバック。
      // sqlDb は開場済みのものを再利用する（再 open は Access Handle 排他で失敗する）。
      console.error(
        "linkself: network wiring failed, falling back to standalone",
        e,
      );
      myDB = await openStandalonePersonalMyDB(sqlDb);
    }
  } else {
    myDB = await openStandalonePersonalMyDB(sqlDb);
  }

  const personalRepo = new LinkSelfPersonalRepository(myDB);
  // settingsService は personalRepo に依存するため作り直す。
  const settingsService = new SettingsService(
    new PersonalRepositorySettingsAdapter(personalRepo),
  );
  return {
    services: { ...base, personalRepo, settingsService },
    stop,
    groupNetwork,
  };
}

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
