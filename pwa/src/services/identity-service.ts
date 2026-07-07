// アイデンティティ（actor DID）解決サービス。
// desktop/frontend の Wails IdentityBinding 相当を PWA 向けに抽象化したもの。
// 本番実装は LinkSelf TS（自 DID の解決）を用いるアダプタに差し替える。

import type { User } from "../domain/models/user";
import type { UserRepository } from "../domain/repositories/user-repository";

export interface IdentityService {
  /** LinkSelf 起動時の実 DID を返す。 */
  getRealDID(): Promise<string>;
  /** 現在のアクター DID を返す（dev モードでは切替後の DID）。 */
  getCurrentActor(): Promise<string>;
  /** dev モードでアクターを切替える。 */
  setCurrentActor(did: string): Promise<void>;
  /** 開発モードか（dev 限定 UI の表示判定に使う）。 */
  isDevMode(): Promise<boolean>;
  /** 切替可能ユーザー一覧（dev モードのみ、本番は空配列）。 */
  listAvailableIdentities(): Promise<User[]>;
  /** DID からユーザーを取得する（ロール解決用）。 */
  getUser(did: string): Promise<User | null>;
}

const DEV_ACTOR_KEY = "dev.identity.actor";

/**
 * 開発用 IdentityService。
 * UserRepository（インメモリ等）のユーザーを切替候補とし、
 * 選択中アクターを localStorage に保持してリロード後も維持する。
 */
export class DevIdentityService implements IdentityService {
  constructor(
    private repo: UserRepository,
    private realDid: string,
  ) {}

  async getRealDID(): Promise<string> {
    return this.realDid;
  }

  async getCurrentActor(): Promise<string> {
    try {
      const stored = localStorage.getItem(DEV_ACTOR_KEY);
      if (stored && (await this.repo.getUser(stored))) {
        return stored;
      }
    } catch {
      // ignore
    }
    return this.realDid;
  }

  async setCurrentActor(did: string): Promise<void> {
    try {
      localStorage.setItem(DEV_ACTOR_KEY, did);
    } catch {
      // ignore
    }
  }

  async isDevMode(): Promise<boolean> {
    return true;
  }

  async listAvailableIdentities(): Promise<User[]> {
    return this.repo.listUsers();
  }

  async getUser(did: string): Promise<User | null> {
    return this.repo.getUser(did);
  }
}

/** 開発用のシードユーザー（ロール別 UI の確認用）。 */
export const DEV_SEED_USERS: User[] = [
  {
    id: "did:dev:admin",
    name: "Dev Admin",
    role: "admin",
    tagIds: [],
    joinedAt: "2026-01-01T00:00:00Z",
  },
  {
    id: "did:dev:editor",
    name: "Dev Editor",
    role: "editor",
    tagIds: [],
    joinedAt: "2026-01-01T00:00:00Z",
  },
  {
    id: "did:dev:member",
    name: "Dev Member",
    role: "member",
    tagIds: [],
    joinedAt: "2026-01-01T00:00:00Z",
  },
];

/** シードユーザーを投入した開発用 IdentityService を作る。 */
export async function createDevIdentityService(
  repo: UserRepository,
): Promise<DevIdentityService> {
  for (const u of DEV_SEED_USERS) {
    await repo.saveUser(u);
  }
  return new DevIdentityService(repo, DEV_SEED_USERS[0].id);
}
