// LinkSelf-backed のサービス束（ScopeDevice 先行スライス）。
//
// 現状スコープ:
// - 個人設定（my_settings / hidden_tips）を LinkSelf MyDB の SQL 面（ブラウザでは
//   OPFS SAHPool VFS の SQLite）に永続する。リロードをまたいで残る。
// - グループドメイン（users/member_tags + regions/parent_areas/areas/places/map_*/
//   checkouts/visit_records/coverages/notifications 等）はグループ MyDB(SQL) に永続し、
//   ネットワーク配線時は ScopeNetwork で全メンバー・全端末へ伝播する
//   （docs/wants/01_共通基盤.md「同期スコープ」）。
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
  depositRosterToMailbox,
  fetchLatestRosterFromMailbox,
  identityFromPrivateKey,
  wireSqlSync,
  type KnownPeer,
} from "@linkself/core";
import type { RoleDefs } from "@linkself/core";
import { LinkSelfPersonalRepository } from "../data/linkself/linkself-personal-repository";
import { LinkSelfUserRepository } from "../data/linkself/linkself-user-repository";
import {
  GROUP_SYNC_TABLES,
  ensureGroupSchema,
} from "../data/linkself/group-schema";
import { LinkSelfRegionRepository } from "../data/linkself/linkself-region-repository";
import { LinkSelfPlaceRepository } from "../data/linkself/linkself-place-repository";
import { LinkSelfCheckoutRepository } from "../data/linkself/linkself-checkout-repository";
import { LinkSelfCoverageRepository } from "../data/linkself/linkself-coverage-repository";
import { LinkSelfNotificationRepository } from "../data/linkself/linkself-notification-repository";
import { LinkSelfMapBinding } from "../data/linkself/linkself-map-binding";
import { migrateLegacyGroupData } from "../data/linkself/legacy-group-data-migration";
import { createLinkSelfClient } from "../lib/linkself/client-factory";
import { loadKnownMembers } from "../lib/linkself/known-members";
import {
  SHARED_APPLIED_EVENT,
  SYNC_REPAIR_REQUESTED_EVENT,
  type SharedAppliedDetail,
} from "../lib/linkself/shared-events";
import { FullSyncSchedule } from "../lib/linkself/full-sync-schedule";
import { LocalStorageEpochStore } from "../lib/linkself/shared-store";
import { SqlSharedStorage } from "../data/linkself/sql-shared-storage";
import { loadOrCreateDeviceTransportKey } from "../lib/linkself/device-key";
import {
  consumePendingSiblingDevices,
  loadOrCreateRoster,
  persistRoster,
  removeDeviceFromRoster,
  setDeviceLabelInRoster,
} from "../lib/linkself/device-roster";
import { registerDeviceDirectory } from "../lib/device-directory";
import { wipeThisDevice } from "../lib/full-reset";
import {
  didToPeerId,
  rosterHasTombstone,
  type SignedRoster,
} from "@linkself/core";
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
import {
  attachNetworkId,
  createGroupSlot,
  dbPoolDirFor,
  dbPoolNameFor,
  ensureActiveSlot,
  groupDbFilename,
  nsKey,
  setActiveGroupSlot,
} from "../lib/group-slots";
import { markPersistenceDegraded } from "../lib/persistence-status";
import { healDivergedSyncState } from "../lib/linkself/sync-state-heal";
import { withUserMailboxTransport } from "../lib/linkself/user-mailbox";
import { syncRosterWithMailbox } from "../lib/linkself/roster-mailbox-sync";
import { AuthServiceImpl } from "../services/auth-service";
import { CheckoutServiceImpl } from "../services/checkout-service";
import { PlaceService } from "../services/place-service";
import { PlaceRepositoryBindingAdapter } from "../services/place-binding-adapter";
import { RegionRepositoryBindingAdapter } from "../services/region-binding-adapter";
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
  /** 個人設定用 OPFS SQLite ファイル名の上書き（テスト用。省略時は本番既定名）。 */
  personalDbFilename?: string;
  /** グループ用 OPFS SQLite ファイル名の上書き（テスト用。省略時はアクティブスロット既定名）。 */
  groupDbFilenameOverride?: string;
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
 * ため、同一ファイルを二重に open してはならない）。個人設定 DB とグループ DB の
 * 両方で使う（ファイルは別）。
 */
async function openStandaloneMyDB(sqlDb: SqliteWasmDatabase): Promise<MyDB> {
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
  // グループ毎のローカル DB 分離（docs/wants/01）: 個人設定はグループ非依存の
  // 個人 DB、グループ系（users/member_tags + 共有状態キー）はアクティブスロットの
  // 名前空間に置く。スロットは bootstrap（main.tsx）の移行後に必ず存在する。
  const slot = ensureActiveSlot();
  const personalFilename = opts.personalDbFilename ?? PERSONAL_DB_FILENAME;
  const groupFilename =
    opts.groupDbFilenameOverride ?? groupDbFilename(slot.slotId);
  const useNetwork = opts.seed != null && (opts.relays?.length ?? 0) > 0;

  // OPFS SQLite は各ファイル一度だけ開き、以降の全経路（ネットワーク/スタンド
  // アロン/配線失敗フォールバック）で同一インスタンスを共有する。SAHPool の
  // Access Handle は排他のため、同一ファイルの二重 open は必ず失敗する。
  // さらに SAHPool は**プールディレクトリ単位**で排他するため、2 つ目以降の DB
  // （グループ DB）はファイル毎の専用プール（vfsPool）で開く。個人 DB は既存
  // データ互換のため既定プールに置いたままにする。
  // 開けない場合（別タブが保持中など。多タブ直列化は未実装 = docs/wants/01）は
  // このタブに限り in-memory で起動し、アプリを起動不能にしない。
  const openDb = async (
    filename: string,
    dedicatedPool: boolean,
    onFallback?: () => void,
  ): Promise<SqliteWasmDatabase> => {
    try {
      return await SqliteWasmDatabase.open({
        filename,
        vfsPool: dedicatedPool
          ? { name: dbPoolNameFor(filename), directory: dbPoolDirFor(filename) }
          : undefined,
      });
    } catch (e) {
      console.warn(
        `linkself: OPFS DB open failed for ${filename} (another tab holding ` +
          "the Access Handle?). Falling back to in-memory for this tab — " +
          "data will not persist here.",
        e,
      );
      // 無言のインメモリ化は永続喪失の見逃しに直結する（learnings L-010）。
      // Layout が警告バナーを出せるよう記録する。
      markPersistenceDegraded();
      onFallback?.();
      return SqliteWasmDatabase.open({ filename: ":memory:" });
    }
  };
  const personalSqlDb = await openDb(personalFilename, false);
  let groupDbFellBack = false;
  const groupSqlDb = await openDb(groupFilename, true, () => {
    groupDbFellBack = true;
  });
  // 同期状態の自己修復（docs/wants/01「同期状態の自己修復」）: iOS「ホーム画面に
  // 追加」等のストレージ部分コピーで「localStorage の同期フラグは残っているのに
  // グループ DB（OPFS）は空」になると、includeExisting も catch-up も済み扱いで
  // データが永遠に届かない。スキーマ適用前（= 新規 DB を判別できるうち）に
  // 陳腐化フラグを破棄する。in-memory フォールバック時は実 DB が別タブで健在
  // なので照合しない（誤破棄→データ入り DB への includeExisting 再実行を防ぐ）。
  // healed 時は移行ソースの旧キーも破棄されるが、createInMemoryServices（base）は
  // 構築時に旧キーを既にメモリへ読み込んでいるため、この起動のレガシー移行も
  // 明示的にスキップする（陳腐データの base.userRepo 経由再インポート防止）。
  const syncStateHealed = groupDbFellBack
    ? false
    : await healDivergedSyncState(groupSqlDb, slot.slotId);
  // 個人設定はクライアント（グループ DB）と切り離した個人 DB に常駐する。
  // ScopeDevice の devicesync ミラーは兄弟端末ダイヤル導入時に再配線する。
  const personalMyDB = await openStandaloneMyDB(personalSqlDb);

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
      // 自端末を登録した署名済みロスター。ペアリング payload から控えた
      // 発行側デバイス DID があれば追加署名して取り込む（QR にはロスター本体を
      // 載せない。以後は接続時の announce 統合で収束）。
      let currentRoster = await consumePendingSiblingDevices(
        userIdentity,
        await loadOrCreateRoster(userIdentity, deviceIdentity.did),
      );
      // 前回セッションで失効（tombstone）を受理したままワイプが完了しなかった
      // 残骸端末は、起動時に今度こそ全初期化する（docs/wants/01「削除の意味」）。
      if (rosterHasTombstone(currentRoster, deviceIdentity.did)) {
        await wipeThisDevice();
        throw new Error("device revoked — wiping");
      }
      // 兄弟端末（ロスター掲載の他デバイス）へのダイヤル先。リレーが固定のため
      // presence を待たず circuit アドレスを合成できる（peerId ≡ device DID。
      // docs/wants/01「自己端末間のローカルデータ同期」）。
      const siblingCircuitPeers = (roster: SignedRoster): KnownPeer[] =>
        roster.devices
          .filter((d) => d.deviceDID !== deviceIdentity.did)
          .flatMap((d) => {
            try {
              const peerId = didToPeerId(d.deviceDID).toString();
              const addrs = (opts.relays ?? []).flatMap((r) =>
                r.addrs.map((a) => `${a}/p2p-circuit/p2p/${peerId}`),
              );
              return addrs.length > 0 ? [{ did: d.deviceDID, addrs }] : [];
            } catch {
              return [];
            }
          });
      const siblingPeers = siblingCircuitPeers(currentRoster);
      // onAsyncJoinDecision / onMemberJoined はファサード・リポジトリ構築前に
      // client へ渡す必要があるため可変参照で後結びする。
      let gn: GroupNetworkService | undefined;
      let networkUserRepo: LinkSelfUserRepository | undefined;
      // ワイプ時の graceful stop（Access Handle 解放）。session 構築後に後結びする。
      let stopForWipe: (() => Promise<void>) | null = null;
      let wiping = false;
      // ロスターメールボックス（link-self spec §7.6 / docs/wants/01「ロスター
      // メールボックス」）: ロスター変更を 3 秒合流でユーザー DID 宛メールボックス
      // へ預け直す（新端末・オフライン端末が兄弟 DID / 失効を非同期に解決できる）。
      const mailboxPeers = opts.relays ?? [];
      let rosterDepositTimer: ReturnType<typeof setTimeout> | null = null;
      const scheduleRosterDeposit = () => {
        if (mailboxPeers.length === 0 || wiping) return;
        if (rosterDepositTimer != null) clearTimeout(rosterDepositTimer);
        rosterDepositTimer = setTimeout(() => {
          rosterDepositTimer = null;
          if (wiping) return; // ワイプ開始後に旧ロスターを預け直さない
          const snapshot = currentRoster;
          void withUserMailboxTransport(
            userIdentity,
            mailboxPeers,
            (t) => depositRosterToMailbox(t, snapshot),
            opts.allowLocalDial,
          ).catch((e) =>
            console.warn("linkself: roster mailbox deposit failed", e),
          );
        }, 3_000);
      };
      const session = await createLinkSelfClient({
        identity: deviceIdentity,
        userIdentity,
        roster: currentRoster,
        // presence 未実装のため、参加時に保存した既知メンバー（管理者）へも
        // FastStart で毎起動ダイヤルする（ハブ型トポロジで catch-up を成立させる）。
        knownPeers: [
          ...(opts.relays ?? []),
          ...loadKnownMembers(),
          ...siblingPeers,
        ],
        // announce 統合で自ロスターが育ったら永続する（次回起動のダイヤル先に
        // 反映。persist が UI イベントも発火＝デバイス一覧が再読み込みなしで
        // 追従する。docs/wants/01「ロスター更新の即時 UI 反映」）。
        onRosterUpdated: (updated) => {
          // 自分の tombstone（明示的な失効記録）を含むロスター＝別端末がこの
          // 端末を削除した（ユーザー鍵署名は merge で検証済み）。仕様は常に
          // 全初期化（docs/wants/01「削除の意味」）。単なる「掲載に無い」は
          // ペアリング直後の未収束（発行側がまだ自分を学んでいない）でも起きる
          // 正当な過渡状態のため、ワイプの根拠にしない。
          if (rosterHasTombstone(updated, deviceIdentity.did)) {
            if (!wiping) {
              wiping = true;
              registerDeviceDirectory(null);
              void wipeThisDevice(stopForWipe ?? undefined);
            }
            return; // 失効ロスターは永続しない
          }
          currentRoster = updated;
          persistRoster(updated);
          // announce 統合で育ったロスターはメールボックスにも預け直す。
          scheduleRosterDeposit();
        },
        sqlDatabase: groupSqlDb,
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
        // 共有レコード（catch-up 高水位・LWW 材料・catch-up 応答の再送元）は
        // グループ DB（SQL）に保存する。旧 localStorage 実装は quota 超過を
        // 黙殺し応答側の集合が欠損した（map_* 全面移行後の実害。docs/wants/01
        // 「共有レコードストアの SQL 化」）。旧キーは一度きり移行して解放する。
        // in-memory フォールバック時は移行しない（捨て DB へ移行してソースキー
        // を破棄すると、次の健常起動で LWW 判定材料を失い、バックフィル TS=1 が
        // ピアの陳腐コピーに負けて最新編集が巻き戻る。heal を skip するのと同じ
        // 理由付け）。
        sharedStorage: new SqlSharedStorage(
          groupSqlDb,
          groupDbFellBack
            ? {}
            : { legacyLocalStorageKey: nsKey(slot.slotId, "sharedRecords") },
        ),
        epochStore: new LocalStorageEpochStore(
          nsKey(slot.slotId, "membershipEpochs"),
        ),
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
      // 完全 catch-up（アンチエントロピー）: 差分 catch-up は高水位の下に埋まった
      // 取りこぼし行を二度と要求できないため、(a) 起動配線後 (b) 約 10 分周期
      // (c) 不整合検出リペア要求時 に since 全チャネル 0 の catch-up を接続中ピア
      // のみへ送る（docs/wants/01「同期完全性の補完＝完全 catch-up」）。
      const fullSyncSchedule = new FullSyncSchedule();
      // ScopeNetwork 配線完了前は完全 catch-up しない（チャネル未登録だと応答
      // レコードが unknown channel として捨てられ、全量転送が無駄になるため）。
      let networkScopesWired = false;
      const runFullSync = () => {
        const networkId = idStore.get();
        if (!networkId || !networkScopesWired || wiping) return;
        fullSyncSchedule.markRun(Date.now());
        void client
          .requestGroupSync(networkId, { full: true, queueOffline: false })
          .catch((err) => {
            console.warn("linkself: full catch-up request failed", err);
          });
      };
      const onSyncRepairRequested = () => {
        if (fullSyncSchedule.shouldRunOnRepair(Date.now())) runFullSync();
      };
      const wireNetworkScopes = async (networkId: string) => {
        const flagKey = nsKey(slot.slotId, "scopedTables");
        let scoped: string[] = [];
        try {
          scoped = JSON.parse(
            localStorage.getItem(flagKey) ?? "[]",
          ) as string[];
        } catch {
          scoped = [];
        }
        for (const table of GROUP_SYNC_TABLES) {
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
        // チャネル登録（setSyncScope）が済んだ時点で完全 catch-up 可能になる。
        // フラグは後続の失敗し得る await より前に立てる（送信の一過性失敗で
        // 完全 catch-up の全契機がセッション中無効化されないように）。
        networkScopesWired = true;
        // 共有レコードの欠損補充（バックフィル）: 旧 localStorage ストアの
        // quota 欠損等で「SQL 行はあるのに共有レコードが無い」行を合成
        // タイムスタンプ 1 で再生成し、catch-up 応答で再送可能にする
        // （LWW で絶対に勝たないため実レコード・墓石は上書きされない。
        // docs/wants/01「共有レコードストアの SQL 化」）。
        try {
          let backfilled = 0;
          for (const table of GROUP_SYNC_TABLES) {
            backfilled += await client.myDB.backfillScopedTable(table);
          }
          if (backfilled > 0) {
            console.info(
              `linkself: backfilled ${backfilled} shared records from SQL rows`,
            );
          }
        } catch (e) {
          console.warn("linkself: shared record backfill failed", e);
        }
        await client.requestGroupSync(networkId);
        // 起動時の完全 catch-up（契機 (a)）。上の差分 catch-up は store-and-forward
        // で不在ピアにも届く軽量経路として残し、完全版は接続中ピアのみに送る。
        runFullSync();
      };

      // networkId は (a) 既に永続済み（起動時） (b) 創設/参加で新規確定、の
      // 両方で配線する。(b) は NetworkIdStore.set をフックして拾う。
      // (a) はスキーマ適用・旧データ移行の後に実行する（initialScopeWiring）。
      const idStore = localStorageNetworkIdStore(
        nsKey(slot.slotId, "networkId"),
      );
      const hookedIdStore = {
        get: () => idStore.get(),
        set: (id: string) => {
          // 追加参加ガード: アクティブスロットが既に別ネットワークに属している
          // 場合は上書きしない（docs/wants/04「既存所属を上書きしない」）。
          // 新しいスロットを作って networkId を記録し、次回起動（JoinPage 成立後の
          // 再読み込み）で新スロットの空 DB に配線・catch-up させる。この セッションの
          // 配線は旧グループのままにする（旧 DB へ新グループのデータを混ぜない）。
          const existing = idStore.get();
          if (existing && existing !== id) {
            const added = createGroupSlot({ networkId: id });
            try {
              localStorage.setItem(nsKey(added.slotId, "networkId"), id);
            } catch {
              // ignore
            }
            setActiveGroupSlot(added.slotId);
            return;
          }
          idStore.set(id);
          // スロット記録（設定画面のグループ一覧表示用）も追従させる。
          attachNetworkId(slot.slotId, id);
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
      // ワイプ（デバイス失効の受理）時の graceful stop を後結びする。
      stopForWipe = () => session.stop();
      // 起動時のロスターメールボックス同期: 最新ロスターを取得・統合し、最後に
      // 預け直して TTL を更新する。ペアリング直後の端末はここで全兄弟 DID を
      // 知り、発行側端末が不在でも第三の端末（PC 等）へ到達できる（サブデバイス
      // 発行 QR で親デバイスと紐づかない問題の恒久修正）。統合の適用は setLabel と
      // 同型のリベースループ（announce 統合の割り込みで進んだ currentRoster を
      // 巻き戻さない）。自分の tombstone を受理したら announce 側と同じく全初期化
      //（オフライン中に失効された端末がここで指示を受け取る）。
      let rosterMailboxSynced = false;
      // in-flight ガード: リレー不達で接続がハングしている間に 60 秒 poll が
      // 並行の同期（createLibp2p フルインスタンス）を積み増さない。
      let rosterMailboxSyncing = false;
      const syncRosterMailbox = async () => {
        if (mailboxPeers.length === 0 || wiping || rosterMailboxSyncing) {
          return;
        }
        rosterMailboxSyncing = true;
        try {
          const res = await withUserMailboxTransport(
            userIdentity,
            mailboxPeers,
            (t) =>
              syncRosterWithMailbox(
                userIdentity,
                {
                  fetchLatest: () =>
                    fetchLatestRosterFromMailbox(t, userIdentity),
                  deposit: async (r) => {
                    await depositRosterToMailbox(t, r);
                  },
                },
                {
                  getCurrent: () => currentRoster,
                  selfDeviceDID: deviceIdentity.did,
                  isAborted: () => wiping,
                  // 交換と永続を同期的に行う（announce 統合が割り込んでいたら
                  // false でリベース）。
                  commit: (base, merged) => {
                    if (currentRoster !== base) return false;
                    currentRoster = merged;
                    persistRoster(merged);
                    return true;
                  },
                  onRevoked: () => {
                    if (!wiping) {
                      wiping = true;
                      registerDeviceDirectory(null);
                      void wipeThisDevice(stopForWipe ?? undefined);
                    }
                  },
                },
              ),
            opts.allowLocalDial,
          );
          if (res.applied) {
            await session.client.updateRoster(res.applied);
            // 新しく知った兄弟へ 60 秒ポーリングを待たず即時ダイヤルする。
            void session.client
              .redial(siblingCircuitPeers(res.applied))
              .catch(() => {});
          }
          if (res.deposited) rosterMailboxSynced = true;
        } catch (e) {
          console.warn("linkself: roster mailbox sync failed", e);
        } finally {
          rosterMailboxSyncing = false;
        }
      };
      void syncRosterMailbox();
      // ラベル変更・端末削除の窓口（設定画面 → identity-service → ここ）。
      // ロスターを rev+1 で再署名・永続し、接続中の兄弟端末へ即時 announce する
      // （docs/wants/01「ラベルの同期」「削除の意味」）。
      registerDeviceDirectory({
        setLabel: async (deviceDID, label) => {
          // 署名の await 中に announce 統合（onRosterUpdated）が currentRoster
          // を進めた場合は、その新しいロスターへリベースして適用し直す
          // （古いスナップショット由来の rev+1 で統合結果を巻き戻さない）。
          for (;;) {
            const base = currentRoster;
            const updated = await setDeviceLabelInRoster(
              userIdentity,
              base,
              deviceDID,
              label,
            );
            if (updated === base) return; // ロスター未掲載 → 変更なし
            if (currentRoster !== base) continue; // 統合が割り込んだ → リベース
            currentRoster = updated;
            await session.client.updateRoster(updated);
            scheduleRosterDeposit();
            return;
          }
        },
        removeDevice: async (deviceDID) => {
          // 失効ロスター（rev+1）を残る兄弟へ announce し、対象端末宛にも直接
          // 送る（store-and-forward。オフラインなら次回接続時に受理→全初期化）。
          for (;;) {
            const base = currentRoster;
            const updated = await removeDeviceFromRoster(
              userIdentity,
              base,
              deviceDID,
            );
            if (updated === base) return; // 掲載なし → 変更なし
            if (currentRoster !== base) continue; // 統合が割り込んだ → リベース
            currentRoster = updated;
            await session.client.updateRoster(updated);
            await session.client.sendRosterTo(deviceDID);
            // 失効ロスターの恒久配送: 対象端末がオフラインでも次回起動の
            // メールボックス同期で tombstone を受理して全初期化できる。
            scheduleRosterDeposit();
            return;
          }
        },
      });
      // 非同期参加の成立待ちを復元し、メールボックスを起動時 + 定期（60 秒）で
      // 確認する（管理者側の無人受理・被招待者側の結果受領の両方を担う）。
      // 同じ周期で未接続の兄弟端末へ再ダイヤルする（片側だけ先に起動していた・
      // 一時切断などでも、再読み込みなしで出会い直して catch-up が走る。
      // docs/wants/01「兄弟端末への定期再ダイヤル」）。
      gn.restorePendingJoin();
      const poll = () => {
        void session.client.checkMailbox().catch((err) => {
          console.warn("linkself: checkMailbox failed", err);
        });
        // 初回のロスターメールボックス同期が未成功（リレー一時不達等）なら
        // 再試行する。ペアリング直後の新端末はこれが成功するまで兄弟 DID を
        // 解決できないため、フルリロードを待たず回復させる。
        if (!rosterMailboxSynced) void syncRosterMailbox();
        // 再ダイヤル対象はリレー + 兄弟端末のみ（peerId ≡ DID で接続済み判定が
        // 効く相手）。既知メンバー（アカウント DID）を渡すと接続済みでも毎回
        // 再認証され、auth 後フック（announce + catch-up）が 60 秒毎に全員分
        // 走ってしまうため含めない。
        void session.client
          .redial([
            ...(opts.relays ?? []),
            ...siblingCircuitPeers(currentRoster),
          ])
          .catch((err) => {
            console.warn("linkself: sibling redial failed", err);
          });
        // 定期の完全 catch-up（契機 (b)。約 10 分周期＝ tick 10 回に 1 回）。
        // 開きっぱなしの長時間セッションでもライブ配送の取りこぼしが治癒する。
        if (fullSyncSchedule.shouldRunOnTick(Date.now())) runFullSync();
      };
      // 不整合検出リペア（契機 (c)）: ロード時サニタイズが欠落行参照を検出した
      // 画面から要求される。クールダウンは FullSyncSchedule が担う。
      window.addEventListener(
        SYNC_REPAIR_REQUESTED_EVENT,
        onSyncRepairRequested,
      );
      poll();
      const pollTimer = setInterval(poll, 60_000);
      stop = async () => {
        registerDeviceDirectory(null);
        window.removeEventListener(
          SYNC_REPAIR_REQUESTED_EVENT,
          onSyncRepairRequested,
        );
        clearInterval(pollTimer);
        if (rosterDepositTimer != null) clearTimeout(rosterDepositTimer);
        await session.stop();
      };
    } catch (e) {
      // ネットワーク配線失敗でアプリを起動不能にしない。ローカル永続へフォールバック。
      // groupSqlDb は開場済みのものを再利用する（再 open は Access Handle 排他で失敗する）。
      // 登録済みの DeviceDirectory も外す（死んだ session へ announce し続ける残骸防止）。
      registerDeviceDirectory(null);
      console.error(
        "linkself: network wiring failed, falling back to standalone",
        e,
      );
      myDB = await openStandaloneMyDB(groupSqlDb);
    }
  } else {
    myDB = await openStandaloneMyDB(groupSqlDb);
  }

  const personalRepo = new LinkSelfPersonalRepository(personalMyDB);
  // settingsService は personalRepo に依存するため作り直す。
  const settingsService = new SettingsService(
    new PersonalRepositorySettingsAdapter(personalRepo),
  );

  // users/member_tags はグループ MyDB(SQL) リポジトリへ（両モード共通・OPFS 永続。
  // ネットワーク配線時は ScopeNetwork で全メンバーへ伝播する）。
  const userRepo = networkUserRepoOuter ?? new LinkSelfUserRepository(myDB);
  await userRepo.ensureSchema();
  // 旧実装からの一度きり移行。グループ DB が空のときだけコピーする
  // （自己ユーザー復元後は常に非空になる）。移行元は新しい順に
  // (1) 個人 DB（DB 分割前は users も hvs-personal.db に居た）
  // (2) 旧 localStorage 実装（InMemory persist）。
  try {
    if (!syncStateHealed && (await userRepo.listUsers()).length === 0) {
      const personalDbUsers = new LinkSelfUserRepository(personalMyDB);
      await personalDbUsers.ensureSchema();
      const src =
        (await personalDbUsers.listUsers()).length > 0
          ? personalDbUsers
          : base.userRepo;
      for (const u of await src.listUsers()) {
        await userRepo.saveUser(u);
      }
      for (const t of await src.listTags()) {
        await userRepo.saveTag(t);
      }
    }
  } catch (e) {
    console.warn("linkself: legacy user data migration failed", e);
  }
  // グループドメイン（regions/places/checkouts/coverages/notifications/map_*）も
  // グループ MyDB(SQL) リポジトリへ（両モード共通・OPFS 永続。ネットワーク配線時は
  // ScopeNetwork で全メンバーへ伝播する）。旧 localStorage 実装（InMemory persist）
  // からは SQL 側が空のとき一度だけ移行する。ScopeNetwork 初回昇格（includeExisting）
  // より前に移行しておくことで、既存データが一括配送に乗る。
  await ensureGroupSchema(myDB);
  const storagePrefix = opts.persist
    ? (opts.storagePrefix ?? "hvs")
    : undefined;
  if (!syncStateHealed) await migrateLegacyGroupData(myDB, storagePrefix);
  const regionRepo = new LinkSelfRegionRepository(myDB);
  const placeRepo = new LinkSelfPlaceRepository(myDB);
  const checkoutRepo = new LinkSelfCheckoutRepository(myDB);
  const coverageRepo = new LinkSelfCoverageRepository(myDB);
  const notificationRepo = new LinkSelfNotificationRepository(myDB);
  const mapBinding = new LinkSelfMapBinding(myDB);

  // ScopeNetwork 初回配線（スキーマ・移行の後）。
  await initialScopeWiring?.();

  // 差し替えたリポジトリに依存するサービスを作り直す。
  const authService = new AuthServiceImpl(userRepo);
  const checkoutService = new CheckoutServiceImpl(
    checkoutRepo,
    userRepo,
    notificationRepo,
    regionRepo,
  );
  const visitService = new VisitService(
    new VisitBindingAdapter(checkoutService, checkoutRepo),
  );
  const placeService = new PlaceService(
    new PlaceRepositoryBindingAdapter(placeRepo),
  );
  const regionBindingApi = new RegionRepositoryBindingAdapter(regionRepo);

  return {
    services: {
      ...base,
      personalRepo,
      settingsService,
      userRepo,
      regionRepo,
      placeRepo,
      checkoutRepo,
      coverageRepo,
      notificationRepo,
      authService,
      checkoutService,
      visitService,
      placeService,
      regionBindingApi,
      mapBinding,
    },
    stop,
    groupNetwork,
  };
}

// parseRelays は lib/linkself/relays.ts へ移設（メールボックスのみ使う軽量経路と
// 共用するため）。既存の import 元（main.tsx・テスト）互換のため再エクスポートする。
export { parseRelays } from "../lib/linkself/relays";
