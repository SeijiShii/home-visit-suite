// グループ（= LinkSelf ネットワーク）参加のアプリ向けファサード。
// 起動中の LinkSelfClient を薄くラップし、UI から使う 3 操作を提供する:
//  - ensureFoundingNetwork: 創設者（管理者）のネットワークを作成し ID を永続化
//  - issueInvite: 管理者として 3 日期限の招待 URL を発行（QR にも載せる）
//  - join: 招待 URL/コードを受けてグループに参加
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

/** ファサードが必要とする LinkSelfClient の最小面（テストでモック可能）。 */
export interface GroupClient {
  readonly userIdentity: Identity;
  readonly network: {
    create(suiteId: string, creatorDID: string): Promise<string>;
  };
  requestJoin(
    addr: string,
    invite: Invite,
    displayName: string,
  ): Promise<JoinResponse>;
  /** 被招待者が dial できる自ノード到達アドレス（/p2p-circuit 経由等）。 */
  selfAddrs(): string[];
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

export interface IssueInviteOptions {
  /** 割り当てるロール（既定は活動メンバー）。 */
  role?: string;
  /** 招待 URL のベース（省略時は実行時オリジン）。 */
  baseUrl?: string;
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
   * 既存があればそれを返す（冪等）。
   */
  async ensureFoundingNetwork(): Promise<string> {
    const existing = this.store.get();
    if (existing) return existing;
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
    });
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
}

/** upsertJoinedMember が必要とする UserRepository の最小面。 */
export interface JoinedMemberRepo {
  getUser(id: string): Promise<User | null>;
  saveUser(user: User): Promise<void>;
}

/**
 * 参加受理（onMemberJoined）をアプリのメンバー表へ反映する。
 * displayName は受理した管理者にしか見えないため、ここが唯一の記録点
 * （docs/wants/04「グループ招待」）。既存レコードがあればタグ・参加日時を保持する。
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
  await repo.saveUser({
    id: info.memberDID,
    name: info.displayName.trim() || existing?.name || info.memberDID,
    role,
    tagIds: existing?.tagIds ?? [],
    joinedAt: existing?.joinedAt ?? nowIso,
  });
}
