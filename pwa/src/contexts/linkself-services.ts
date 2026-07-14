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
import {
  LinkSelfUserRepository,
  USER_SYNC_TABLES,
} from "../data/linkself/linkself-user-repository";
import { createLinkSelfClient } from "../lib/linkself/client-factory";
import { loadKnownMembers } from "../lib/linkself/known-members";
import {
  SHARED_APPLIED_EVENT,
  type SharedAppliedDetail,
} from "../lib/linkself/shared-events";
import {
  LocalStorageEpochStore,
  LocalStorageSharedStorage,
} from "../lib/linkself/shared-store";
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
import { AuthServiceImpl } from "../services/auth-service";
import { CheckoutServiceImpl } from "../services/checkout-service";
import { PersonalRepositorySettingsAdapter } from "../services/settings-binding-adapter";
import { SettingsService } from "../services/settings-service";
import { VisitService } from "../services/visit-service";
import { VisitBindingAdapter } from "../services/visit-binding-adapter";
import {
  createInMemoryServices,
  type AppServices,
  type CreateServicesOptions,
} from "./ServicesContext";

/** 個人データ用 OPFS SQLite ファイル名（ブラウザは OPFS、テスト/node は in-memory）。 */
const PERSONAL_DB_FILENAME = "hvs-personal.db";

/**
 * ScopeNetwork テーブル変更の UI 通知（`hvs:shared-applied`）。テーブルごとに
 * 100ms で合流（デバウンス）する — catch-up 等で受信レコードが連続適用される
 * とき、購読側（UsersPage の一覧再読込・IdentityContext の自己再取得）が
 * レコード件数分だけ走ってタブを重くするのを防ぐ。
 */
const notifyTimers = new Map<string, ReturnType<typeof setTimeout>>();
function notifySharedApplied(table: string): void {
  const prev = notifyTimers.get(table);
  if (prev != null) clearTimeout(prev);
  notifyTimers.set(
    table,
    setTimeout(() => {
      notifyTimers.delete(table);
      try {
        globalThis.dispatchEvent?.(
          new CustomEvent<SharedAppliedDetail>(SHARED_APPLIED_EVENT, {
            detail: { table },
          }),
        );
      } catch {
        // 非ブラウザ環境では通知なしでよい
      }
    }, 100),
  );
}

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
  const myDB = new MyDB(engine, proxy);
  wireSqlSync(proxy, myDB);
  return myDB;
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
  let networkUserRepoOuter: LinkSelfUserRepository | undefined;
  // 起動時に networkId が既にある場合の ScopeNetwork 配線（スキーマ適用・
  // 旧データ移行の後に呼ぶため遅延させる）。
  let initialScopeWiring: (() => Promise<void>) | null = null;

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
      // onAsyncJoinDecision / onMemberJoined はファサード・リポジトリ構築前に
      // client へ渡す必要があるため可変参照で後結びする。
      let gn: GroupNetworkService | undefined;
      let networkUserRepo: LinkSelfUserRepository | undefined;
      const session = await createLinkSelfClient({
        identity: deviceIdentity,
        userIdentity,
        roster,
        // presence 未実装のため、参加時に保存した既知メンバー（管理者）へも
        // FastStart で毎起動ダイヤルする（ハブ型トポロジで catch-up を成立させる）。
        knownPeers: [...(opts.relays ?? []), ...loadKnownMembers()],
        sqlDatabase: sqlDb,
        roles: HVS_ROLES,
        allowLocalDial: opts.allowLocalDial,
        // 参加受理（管理者側）でメンバー表へ記録する（displayName はここでしか
        // 得られない）。users は ScopeNetwork 化により全メンバーへ伝播する。
        // 記録後に UI 通知 → 開いている /users が再読み込みなしで反映される。
        onMemberJoined: async (info) => {
          await upsertJoinedMember(networkUserRepo ?? base.userRepo, info);
          notifySharedApplied("users");
        },
        // ネットワーク実体・使用済みノンス・共有レコード・epoch は
        // リロードをまたいで保持する（in-memory だと招待拒否・catch-up 全量
        // 再送・membership 巻き戻りが起きる）。
        networkStore: new LocalStorageNetworkStore(),
        consumedNonces: new LocalStorageConsumedNonceStore(),
        sharedStorage: new LocalStorageSharedStorage(),
        epochStore: new LocalStorageEpochStore(),
        // 非同期参加: メールボックスは常時稼働ノード＝リレーと同一。
        mailboxes: opts.relays,
        // 受理結果（被招待者側）を pending と突き合わせて確定・UI 通知する。
        onAsyncJoinDecision: (nonce, res) => {
          gn?.resolveAsyncDecision(nonce, res);
        },
        // ScopeNetwork テーブルへの受信適用を UI へ通知する（UsersPage 等が
        // 購読。テーブル単位で合流＝バースト時の再読込連発を防ぐ）。
        onSharedApplied: (table) => notifySharedApplied(table),
      });
      myDB = session.client.myDB;
      networkUserRepo = new LinkSelfUserRepository(myDB);

      // ScopeNetwork 配線: networkId が確定しているテーブルを network スコープに
      // する。includeExisting（既存データの一括配送）は初回昇格時のみ
      // （毎起動で行うと新タイムスタンプの再配送で他端末の新しい状態を
      // 上書きし得るため）。配線後に catch-up を要求する。
      const client = session.client;
      const wireNetworkScopes = async (networkId: string) => {
        const flagKey = "hvs.scopedTables";
        let scoped: string[] = [];
        try {
          scoped = JSON.parse(
            localStorage.getItem(flagKey) ?? "[]",
          ) as string[];
        } catch {
          scoped = [];
        }
        for (const table of USER_SYNC_TABLES) {
          const first = !scoped.includes(table);
          await client.myDB.setSyncScope(table, "network", {
            networkId,
            includeExisting: first,
          });
          if (first) scoped.push(table);
        }
        try {
          localStorage.setItem(flagKey, JSON.stringify(scoped));
        } catch {
          // ignore
        }
        await client.requestGroupSync(networkId);
      };

      // networkId は (a) 既に永続済み（起動時） (b) 創設/参加で新規確定、の
      // 両方で配線する。(b) は NetworkIdStore.set をフックして拾う。
      // (a) はスキーマ適用・旧データ移行の後に実行する（initialScopeWiring）。
      const idStore = localStorageNetworkIdStore();
      const hookedIdStore = {
        get: () => idStore.get(),
        set: (id: string) => {
          idStore.set(id);
          void wireNetworkScopes(id).catch((e) =>
            console.warn("linkself: network scope wiring failed", e),
          );
        },
      };
      initialScopeWiring = async () => {
        const existingNetworkId = idStore.get();
        if (existingNetworkId) {
          await wireNetworkScopes(existingNetworkId).catch((e) =>
            console.warn("linkself: network scope wiring failed", e),
          );
        }
      };
      networkUserRepoOuter = networkUserRepo;

      // グループ招待/参加ファサード（起動中の実 client で署名・参加できる）。
      gn = new GroupNetworkService(session.client, hookedIdStore);
      groupNetwork = gn;
      // 非同期参加の成立待ちを復元し、メールボックスを起動時 + 定期（60 秒）で
      // 確認する（管理者側の無人受理・被招待者側の結果受領の両方を担う）。
      gn.restorePendingJoin();
      const poll = () => {
        void session.client.checkMailbox().catch((err) => {
          console.warn("linkself: checkMailbox failed", err);
        });
      };
      poll();
      const pollTimer = setInterval(poll, 60_000);
      stop = async () => {
        clearInterval(pollTimer);
        await session.stop();
      };
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

  // users/member_tags は MyDB(SQL) リポジトリへ（両モード共通・OPFS 永続。
  // ネットワーク配線時は ScopeNetwork で全メンバーへ伝播する）。
  const userRepo = networkUserRepoOuter ?? new LinkSelfUserRepository(myDB);
  await userRepo.ensureSchema();
  // 旧 localStorage 実装（InMemory persist）からの一度きり移行。SQL 側が
  // 空のときだけコピーする（自己ユーザー復元後は常に非空になる）。
  try {
    if ((await userRepo.listUsers()).length === 0) {
      for (const u of await base.userRepo.listUsers()) {
        await userRepo.saveUser(u);
      }
      for (const t of await base.userRepo.listTags()) {
        await userRepo.saveTag(t);
      }
    }
  } catch (e) {
    console.warn("linkself: legacy user data migration failed", e);
  }
  // ScopeNetwork 初回配線（スキーマ・移行の後）。
  await initialScopeWiring?.();

  // userRepo に依存するサービスを新リポジトリで作り直す。
  const authService = new AuthServiceImpl(userRepo);
  const checkoutService = new CheckoutServiceImpl(
    base.checkoutRepo,
    userRepo,
    base.notificationRepo,
    base.regionRepo,
  );
  const visitService = new VisitService(
    new VisitBindingAdapter(checkoutService, base.checkoutRepo),
  );

  return {
    services: {
      ...base,
      personalRepo,
      settingsService,
      userRepo,
      authService,
      checkoutService,
      visitService,
    },
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
