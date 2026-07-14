// グループ（= LinkSelf ネットワーク）参加のアプリ向けファサード。
// 起動中の LinkSelfClient を薄くラップし、UI から使う操作を提供する:
//  - ensureFoundingNetwork: 創設者（管理者）のネットワークを作成し ID を永続化
//  - issueInvite: 管理者として 3 日期限の招待 URL を発行（QR にも載せる）
//  - join: 招待 URL/コードを受けてグループに参加（同期・管理者へ直接到達）
//  - joinAsync: 管理者に届かないとき、メールボックスに封緘リクエストを預けて
//    成立待ちへ（承認は招待発行時に済み・管理者側は無人で自動成立。
//    pending は localStorage 永続・リロード復元）
//  - resolveAsyncDecision: 受理結果（checkMailbox 経由）を pending と突き合わせ、
//    参加成立を確定して UI へ通知する（window CustomEvent）
// ネットワーク実体は各ノードがローカル保持する（network-concept.md §1-2）。
// 設計: link-self/docs/spec/network-invitation.md / docs/wants/04_メンバー管理と権限.md

import type {
  Identity,
  Invite,
  JoinResponse,
  MemberJoinedInfo,
} from "@linkself/core";
import type { Role, User } from "../../domain/models/user";
import {
  buildGroupInviteUrl,
  HVS_SUITE_ID,
  parseGroupInvite,
  type IssuedGroupInvite,
} from "./group-invite";
import { saveKnownMember } from "./known-members";

/** ファサードが必要とする LinkSelfClient の最小面（テストでモック可能）。 */
export interface GroupClient {
  readonly userIdentity: Identity;
  readonly network: {
    create(suiteId: string, creatorDID: string): Promise<string>;
    setMemberRole(
      networkId: string,
      requesterDID: string,
      targetDID: string,
      newRole: string,
    ): Promise<void>;
    kick(
      networkId: string,
      requesterDID: string,
      targetDID: string,
    ): Promise<void>;
  };
  readonly networkStore: {
    getNetwork(id: string): Promise<unknown | null>;
  };
  /** 管理者としてネットワークの membership snapshot をメンバーへ配信する。 */
  publishMembership(networkId: string): Promise<void>;
  requestJoin(
    addr: string,
    invite: Invite,
    displayName: string,
  ): Promise<JoinResponse>;
  /** 被招待者が dial できる自ノード到達アドレス（/p2p-circuit 経由等）。 */
  selfAddrs(): string[];
  /** 非同期参加: 封緘済み参加リクエストをメールボックスに預ける。 */
  depositJoinRequest(invite: Invite, displayName: string): Promise<void>;
  /** 復元した pending をクライアントに再登録する（受理結果の検証に必要）。 */
  registerPendingJoin(invite: Invite): void;
}

/** 所属ネットワーク ID の永続化（既定は localStorage）。 */
export interface NetworkIdStore {
  get(): string | null;
  set(id: string): void;
}

const NETWORK_ID_KEY = "hvs.networkId";

/** localStorage 実装。SSR/未対応環境では no-op に近い挙動になる。 */
export function localStorageNetworkIdStore(
  key = NETWORK_ID_KEY,
): NetworkIdStore {
  return {
    get() {
      try {
        return localStorage.getItem(key);
      } catch {
        return null;
      }
    },
    set(id: string) {
      try {
        localStorage.setItem(key, id);
      } catch {
        // ignore
      }
    },
  };
}

/** 成立待ち（非同期参加）の永続レコード。 */
export interface PendingJoin {
  invite: Invite;
  displayName: string;
  /** 預けた時刻（ISO）。 */
  depositedAt: string;
}

/** 非同期参加の確定結果（UI 通知・未消費時の持ち越しに使う）。 */
export interface AsyncJoinResult {
  nonce: string;
  ok: boolean;
  /** ok:false のときの拒否コード（invite_expired 等）。 */
  code?: string;
  /** ok:true のとき自分に割り当てられたロール。 */
  role?: Role;
}

/** 成立待ちの永続化（既定は localStorage）。 */
export interface PendingJoinStore {
  get(): PendingJoin | null;
  set(p: PendingJoin): void;
  clear(): void;
}

const PENDING_JOIN_STORE_KEY = "hvs.pendingJoin";
/** アプリ側（App）が未消費の参加成立を拾ってロール採用するための持ち越し置き場。 */
export const ASYNC_JOIN_RESULT_KEY = "hvs.asyncJoinResult";
/** 受理結果の到着を UI（JoinPage / App）へ知らせる window イベント名。 */
export const ASYNC_JOIN_EVENT = "hvs:async-join-decision";

export function localStoragePendingJoinStore(
  key = PENDING_JOIN_STORE_KEY,
): PendingJoinStore {
  return {
    get() {
      try {
        const raw = localStorage.getItem(key);
        return raw ? (JSON.parse(raw) as PendingJoin) : null;
      } catch {
        return null;
      }
    },
    set(p: PendingJoin) {
      try {
        localStorage.setItem(key, JSON.stringify(p));
      } catch {
        // ignore
      }
    },
    clear() {
      try {
        localStorage.removeItem(key);
      } catch {
        // ignore
      }
    },
  };
}

export interface IssueInviteOptions {
  /** 割り当てるロール（既定は活動メンバー）。 */
  role?: string;
  /** 招待 URL のベース（省略時は実行時オリジン）。 */
  baseUrl?: string;
  /** 招待 URL に同梱する表示用グループ名（docs/wants/04「グループ名」）。 */
  groupName?: string;
}

export class GroupNetworkError extends Error {
  constructor(
    readonly code: "no_relay_address" | "invite_no_relay" | "unreachable",
    message?: string,
  ) {
    super(message ?? code);
    this.name = "GroupNetworkError";
  }
}

export class GroupNetworkService {
  constructor(
    private readonly client: GroupClient,
    private readonly store: NetworkIdStore,
    private readonly suiteId: string = HVS_SUITE_ID,
    private readonly pendingStore: PendingJoinStore = localStoragePendingJoinStore(),
  ) {}

  /** 所属グループ（ネットワーク）ID。未参加/未創設なら null。 */
  getNetworkId(): string | null {
    return this.store.get();
  }

  /** 自分のアカウント DID（参加応答の memberRoles から自ロールを引くのに使う）。 */
  get selfDID(): string {
    return this.client.userIdentity.did;
  }

  /**
   * 創設: 未作成ならこのユーザーを管理者とするネットワークを作成し ID を永続化する。
   * 既存があればそれを返す（冪等）。保存済み ID の実体がストアに無い場合
   * （in-memory ストア時代の迷子 ID 等）は再利用せず作り直す——実体の無い
   * networkId で招待を発行すると参加が network_not_found で拒否されるため。
   */
  async ensureFoundingNetwork(): Promise<string> {
    const existing = this.store.get();
    if (existing && (await this.client.networkStore.getNetwork(existing))) {
      return existing;
    }
    const id = await this.client.network.create(
      this.suiteId,
      this.client.userIdentity.did,
    );
    this.store.set(id);
    return id;
  }

  /** 管理者として 3 日期限の招待を発行する。ネットワーク未作成なら作成する。 */
  async issueInvite(opts: IssueInviteOptions = {}): Promise<IssuedGroupInvite> {
    const networkId = await this.ensureFoundingNetwork();
    const relays = this.client.selfAddrs();
    if (relays.length === 0) {
      throw new GroupNetworkError(
        "no_relay_address",
        "not reachable yet; connect to a relay before issuing an invite",
      );
    }
    return buildGroupInviteUrl(this.client.userIdentity, {
      networkId,
      relays,
      role: opts.role,
      baseUrl: opts.baseUrl,
      groupName: opts.groupName,
    });
  }

  /**
   * メンバーのロール変更を LinkSelf ネットワーク実体へ反映し、membership snapshot
   * を配信する（docs/wants/04「任免」）。ネットワーク未配線・対象が実体に居ない
   * （開発シード等）場合は false を返し、アプリ側のみの更新とする（best-effort）。
   * 権限違反（no_permission）は投げ直す。
   */
  async setMemberRole(targetDID: string, role: string): Promise<boolean> {
    return this.syncMembership((networkId) =>
      this.client.network.setMemberRole(
        networkId,
        this.selfDID,
        targetDID,
        role,
      ),
    );
  }

  /**
   * メンバーの除名（グループからの削除）を LinkSelf ネットワーク実体へ反映し、
   * membership snapshot を配信する。許容エラー時は false（setMemberRole と同様）。
   * 除名された本人の端末には snapshot は届かない（配信先は除名後のメンバー一覧）。
   */
  async kickMember(targetDID: string): Promise<boolean> {
    return this.syncMembership((networkId) =>
      this.client.network.kick(networkId, this.selfDID, targetDID),
    );
  }

  private async syncMembership(
    mutate: (networkId: string) => Promise<void>,
  ): Promise<boolean> {
    const networkId = this.store.get();
    if (!networkId) return false;
    try {
      await mutate(networkId);
    } catch (e) {
      const code = (e as { code?: string }).code;
      // アプリのメンバー表と LinkSelf 実体の不一致（開発シード・迷子 ID 等）は許容。
      if (
        code === "network_not_found" ||
        code === "target_not_member" ||
        code === "not_member"
      ) {
        return false;
      }
      throw e;
    }
    await this.client.publishMembership(networkId);
    return true;
  }

  /**
   * 招待 URL/コードを受けてグループに参加する。招待に載る管理者の到達アドレスへ
   * 順に接続を試みる。成功時は networkId を永続化する。
   */
  async join(
    input: string,
    displayName: string,
    now?: () => number,
  ): Promise<JoinResponse> {
    const invite = await parseGroupInvite(input, now);
    if (invite.relays.length === 0) {
      throw new GroupNetworkError("invite_no_relay");
    }
    let lastErr: unknown;
    for (const addr of invite.relays) {
      try {
        const res = await this.client.requestJoin(addr, invite, displayName);
        if (res.ok || res.code === "already_member") {
          // 招待発行者（管理者）の到達アドレスを保存 → 次回起動の FastStart で
          // 再接続し catch-up 同期を成立させる（presence 未実装のための
          // ハブ型トポロジ。lib/linkself/known-members.ts）。
          // already_member でも保存する: 過去に参加済みのメンバーが新しい
          // 招待 URL を開き直すことで再接続経路を復旧できる。
          saveKnownMember(invite.inviterDID, invite.relays);
        }
        if (res.ok) {
          this.store.set(res.network.networkId);
        }
        return res;
      } catch (e) {
        lastErr = e;
      }
    }
    throw new GroupNetworkError(
      "unreachable",
      lastErr instanceof Error ? lastErr.message : "could not reach any admin",
    );
  }

  /**
   * 非同期参加: 封緘済みの署名付き参加リクエストをメールボックスに預け、
   * 成立待ち（pending）として永続する。管理者へ直接到達できないときの
   * フォールバック（docs/wants/04「非同期参加」）。
   */
  async joinAsync(
    input: string,
    displayName: string,
    now?: () => number,
  ): Promise<PendingJoin> {
    const invite = await parseGroupInvite(input, now);
    await this.client.depositJoinRequest(invite, displayName);
    const pending: PendingJoin = {
      invite,
      displayName,
      depositedAt: new Date().toISOString(),
    };
    this.pendingStore.set(pending);
    return pending;
  }

  /** 成立待ちの参加（あれば）。UI の待機表示・重複 deposit 回避に使う。 */
  getPendingJoin(): PendingJoin | null {
    return this.pendingStore.get();
  }

  /**
   * 起動時に呼ぶ: 永続化された成立待ちをクライアントへ再登録する
   * （登録が無いと checkMailbox が受理結果を検証・適用できない）。
   * 招待自体が失効していたら成立待ちを破棄し、失効結果を返す。
   */
  restorePendingJoin(now: () => number = Date.now): AsyncJoinResult | null {
    const pending = this.pendingStore.get();
    if (pending == null) {
      return null;
    }
    if (now() > pending.invite.expiresAt) {
      // 管理者側アプリが期限内にオンラインにならず成立しなかった。成立待ちを終了し失効として報告する。
      this.pendingStore.clear();
      const result: AsyncJoinResult = {
        nonce: pending.invite.nonce,
        ok: false,
        code: "invite_expired",
      };
      this.storeResult(result);
      return result;
    }
    this.client.registerPendingJoin(pending.invite);
    return null;
  }

  /**
   * checkMailbox が検証・適用した受理結果を確定する（onAsyncJoinDecision から
   * 呼ばれる）。networkId を永続化し、pending を解消し、結果を持ち越し置き場に
   * 保存して window イベントで UI に通知する。
   */
  resolveAsyncDecision(
    nonce: string,
    response: JoinResponse,
  ): AsyncJoinResult | null {
    const pending = this.pendingStore.get();
    if (pending == null || pending.invite.nonce !== nonce) {
      return null; // 知らない参加への結果（多重タブ等）は無視
    }
    let result: AsyncJoinResult;
    if (response.ok) {
      this.store.set(response.network.networkId);
      // 招待発行者（管理者）の到達アドレスを保存（同期参加と同じ理由）。
      saveKnownMember(pending.invite.inviterDID, pending.invite.relays);
      const joined = response.network.memberRoles[this.selfDID];
      const role: Role =
        joined === "admin" || joined === "editor" ? joined : "member";
      result = { nonce, ok: true, role };
    } else {
      result = { nonce, ok: false, code: response.code };
    }
    this.pendingStore.clear();
    this.storeResult(result);
    try {
      globalThis.dispatchEvent?.(
        new CustomEvent(ASYNC_JOIN_EVENT, { detail: result }),
      );
    } catch {
      // 非ブラウザ環境（テスト等）では通知なしでよい
    }
    return result;
  }

  private storeResult(result: AsyncJoinResult): void {
    try {
      localStorage.setItem(ASYNC_JOIN_RESULT_KEY, JSON.stringify(result));
    } catch {
      // ignore
    }
  }
}

/**
 * 未消費の非同期参加結果を取り出して消費する（App 起動時に呼び、参加成立時の
 * ロール採用を「結果が届いたとき JoinPage が閉じていた」場合にも保証する）。
 */
export function consumeAsyncJoinResult(): AsyncJoinResult | null {
  try {
    const raw = localStorage.getItem(ASYNC_JOIN_RESULT_KEY);
    if (raw == null) {
      return null;
    }
    localStorage.removeItem(ASYNC_JOIN_RESULT_KEY);
    return JSON.parse(raw) as AsyncJoinResult;
  } catch {
    return null;
  }
}

/** upsertJoinedMember が必要とする UserRepository の最小面。 */
export interface JoinedMemberRepo {
  getUser(id: string): Promise<User | null>;
  saveUser(user: User): Promise<void>;
  listUsers(): Promise<User[]>;
}

/**
 * 既存メンバーと衝突しない表示名を返す。衝突時は「名前(2)」から連番を付与する
 * （docs/wants/04「グループ招待」参加受理時の同名解決）。自分（selfId）の
 * 既存レコードは衝突対象から除く。
 */
async function uniqueMemberName(
  repo: JoinedMemberRepo,
  selfId: string,
  base: string,
): Promise<string> {
  const taken = new Set(
    (await repo.listUsers()).filter((u) => u.id !== selfId).map((u) => u.name),
  );
  if (!taken.has(base)) return base;
  let n = 2;
  while (taken.has(`${base}(${n})`)) n++;
  return `${base}(${n})`;
}

/**
 * 参加受理（onMemberJoined）をアプリのメンバー表へ反映する。
 * displayName は受理した管理者にしか見えないため、ここが唯一の記録点
 * （docs/wants/04「グループ招待」）。既存レコードがあればタグ・参加日時を保持する。
 * 表示名が既存メンバーと衝突する場合は「(2)」からの連番を付けて記録する。
 */
export async function upsertJoinedMember(
  repo: JoinedMemberRepo,
  info: MemberJoinedInfo,
  nowIso: string = new Date().toISOString(),
): Promise<void> {
  const existing = await repo.getUser(info.memberDID);
  // LinkSelf のロール名はアプリの Role と同名（HVS_ROLES）。未知値は member 扱い。
  const role: Role =
    info.role === "admin" || info.role === "editor" ? info.role : "member";
  const base = info.displayName.trim() || existing?.name || info.memberDID;
  await repo.saveUser({
    id: info.memberDID,
    name: await uniqueMemberName(repo, info.memberDID, base),
    role,
    tagIds: existing?.tagIds ?? [],
    joinedAt: existing?.joinedAt ?? nowIso,
  });
}
