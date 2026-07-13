// LinkSelf-backed のサービス束（ScopeDevice 先行スライス）。
//
// 現状スコープ:
// - 個人設定（my_settings / hidden_tips）を LinkSelf MyDB の SQL 面（ブラウザでは
//   OPFS SAHPool VFS の SQLite）に永続する。リロードをまたいで残る。
// - それ以外（regions/places/checkouts 等 = ScopeNetwork）は暫定の InMemory+localStorage
//   のまま。メンバー間共有は link-self Phase C（ScopeNetwork⇄groupshare）待ちのため
//   ここでは差し替えない（docs/wants/01_共通基盤.md「同期スコープ」）。
//
// ネットワーク層（libp2p / リレー / メールボックス）はまだ配線しない。接続先の
// 常時稼働ノード（linkself-daemon）が要るため Slice-2 で client-factory 越しに繋ぐ。
// 本スライスは「MyDB+OPFS の実スタックを実アプリで永続させる」ことの実証に絞る。
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
} from "@linkself/core";
import { LinkSelfPersonalRepository } from "../data/linkself/linkself-personal-repository";
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
 * OPFS-backed の MyDB（KV=devicesync + SQL）を組む。SQL 書き込みは wireSqlSync
 * 経由で devicesync にミラーされる（Go クライアントと同じ配線。Slice-2 で
 * LinkSelfClient に載せ替える際もこの MyDB 生成をクライアント内部の myDB に置換）。
 */
async function openPersonalMyDB(filename: string): Promise<MyDB> {
  const sqlDb = await SqliteWasmDatabase.open({ filename });
  const engine = new ReplicationEngine({
    storage: new MemDeviceStorage(),
    // Slice-1 は単一端末（同期相手なし）。self DID は Slice-2 で実 identity に差し替える。
    selfDID: "did:key:zlocal",
    peers: async () => [],
    send: async () => {},
  });
  const proxy = await SqlProxy.open(sqlDb);
  wireSqlSync(proxy, engine);
  return new MyDB(engine, proxy);
}

export interface CreateLinkSelfServicesOptions extends CreateServicesOptions {
  /** OPFS SQLite ファイル名の上書き（テスト用。省略時は本番既定名）。 */
  personalDbFilename?: string;
}

/**
 * LinkSelf-backed のサービス束を構築する。個人設定のみ MyDB(OPFS SQL) に永続し、
 * 残りは createInMemoryServices の暫定実装を流用する。
 */
export async function createLinkSelfServices(
  opts: CreateLinkSelfServicesOptions = {},
): Promise<AppServices> {
  const base = createInMemoryServices(opts);
  const myDB = await openPersonalMyDB(
    opts.personalDbFilename ?? PERSONAL_DB_FILENAME,
  );
  const personalRepo = new LinkSelfPersonalRepository(myDB);
  // settingsService は personalRepo に依存するため作り直す。
  const settingsService = new SettingsService(
    new PersonalRepositorySettingsAdapter(personalRepo),
  );
  return { ...base, personalRepo, settingsService };
}
