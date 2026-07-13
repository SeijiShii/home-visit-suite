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
  wireSqlSync,
  type KnownPeer,
} from "@linkself/core";
import { LinkSelfPersonalRepository } from "../data/linkself/linkself-personal-repository";
import { createLinkSelfClient } from "../lib/linkself/client-factory";
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

/** LinkSelf-backed サービス束。stop() で libp2p を graceful に停止する（非ネットワーク時は no-op）。 */
export interface LinkSelfServicesBundle {
  services: AppServices;
  /** 前景→非表示遷移やアンロード時に呼ぶ graceful stop（docs/wants/11 §2）。 */
  stop(): Promise<void>;
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
 */
async function openStandalonePersonalMyDB(filename: string): Promise<MyDB> {
  const sqlDb = await SqliteWasmDatabase.open({ filename });
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

  let myDB: MyDB;
  let stop = async (): Promise<void> => {};

  if (useNetwork) {
    try {
      const sqlDb = await SqliteWasmDatabase.open({ filename });
      const identity = await linkselfIdentityFromSeed(opts.seed!);
      const session = await createLinkSelfClient({
        identity,
        knownPeers: opts.relays,
        sqlDatabase: sqlDb,
        allowLocalDial: opts.allowLocalDial,
      });
      myDB = session.client.myDB;
      stop = session.stop;
    } catch (e) {
      // ネットワーク配線失敗でアプリを起動不能にしない。ローカル永続へフォールバック。
      console.error(
        "linkself: network wiring failed, falling back to standalone",
        e,
      );
      myDB = await openStandalonePersonalMyDB(filename);
    }
  } else {
    myDB = await openStandalonePersonalMyDB(filename);
  }

  const personalRepo = new LinkSelfPersonalRepository(myDB);
  // settingsService は personalRepo に依存するため作り直す。
  const settingsService = new SettingsService(
    new PersonalRepositorySettingsAdapter(personalRepo),
  );
  return { services: { ...base, personalRepo, settingsService }, stop };
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
