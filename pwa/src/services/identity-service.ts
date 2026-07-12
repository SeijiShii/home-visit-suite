// アイデンティティ（actor DID）解決サービス。
// desktop/frontend の Wails IdentityBinding 相当を PWA 向けに抽象化したもの。
// 本番実装は LinkSelf TS（自 DID の解決）を用いるアダプタに差し替える。

import type { Role, User } from "../domain/models/user";
import type { UserRepository } from "../domain/repositories/user-repository";
import {
  generateIdentity,
  identityFromSeed,
  seedFromBase64,
  seedToBase64,
} from "../lib/identity-crypto";
import {
  createPairingToken,
  decodePairingPayload,
  encodePairingPayload,
  PairingError,
  validatePairing,
  type PairingPayload,
} from "../lib/pairing";

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
  /** 実 identity（自分の ID）がローカルに保存済みか。未保存ならオンボーディングへ誘導する。 */
  hasIdentity(): Promise<boolean>;
  /** 保存済み identity があれば UserRepository へ自己ユーザーを復元して返す。 */
  loadIdentity(): Promise<User | null>;
  /** 新しい identity を生成し、自分（創設 = 管理者）のユーザーを作成する。 */
  createIdentity(name: string): Promise<User>;
  /** この ID に別端末を追加するためのペアリング用テキスト（QR 内容）を作る。 */
  createPairingToken(): Promise<{ text: string; expiresAt: number }>;
  /** 別端末で表示された QR/コードを取り込み、同一 identity を復元してユーザーを返す。 */
  completePairing(text: string): Promise<User>;
}

const DEV_ACTOR_KEY = "dev.identity.actor";
/** 自分の identity（did / 秘密鍵シード / 表示名 / ロール）の localStorage キー。 */
const IDENTITY_KEY = "hvs.identity";
/** ペアリングトークンの有効期限（5分）。 */
const PAIRING_TTL_MS = 5 * 60_000;

interface StoredIdentity {
  did: string;
  seedB64: string;
  name: string;
  role: Role;
}

/**
 * 実 identity を localStorage（`hvs.identity`）に保管する PWA 向け IdentityService。
 * 実鍵の生成・ペアリングは identity-crypto / pairing（LinkSelf 形式互換）に委譲する。
 * LinkSelf 本統合（M5）で @linkself/core の実クライアント + 安全ストレージへ差し替える。
 */
export class LocalIdentityService implements IdentityService {
  constructor(
    private repo: UserRepository,
    private devMode = false,
  ) {}

  private read(): StoredIdentity | null {
    try {
      const raw = localStorage.getItem(IDENTITY_KEY);
      return raw ? (JSON.parse(raw) as StoredIdentity) : null;
    } catch {
      return null;
    }
  }

  private write(s: StoredIdentity): void {
    try {
      localStorage.setItem(IDENTITY_KEY, JSON.stringify(s));
      // 新しい自分を現アクターにするため dev 切替の残骸を消す。
      localStorage.removeItem(DEV_ACTOR_KEY);
    } catch {
      // ignore
    }
  }

  private toUser(s: StoredIdentity): User {
    return {
      id: s.did,
      name: s.name,
      role: s.role,
      tagIds: [],
      joinedAt: new Date().toISOString(),
    };
  }

  async hasIdentity(): Promise<boolean> {
    return this.read() !== null;
  }

  async getRealDID(): Promise<string> {
    return this.read()?.did ?? "";
  }

  async getCurrentActor(): Promise<string> {
    try {
      const stored = localStorage.getItem(DEV_ACTOR_KEY);
      if (stored && (await this.repo.getUser(stored))) return stored;
    } catch {
      // ignore
    }
    return this.read()?.did ?? "";
  }

  async setCurrentActor(did: string): Promise<void> {
    try {
      localStorage.setItem(DEV_ACTOR_KEY, did);
    } catch {
      // ignore
    }
  }

  async isDevMode(): Promise<boolean> {
    return this.devMode;
  }

  async listAvailableIdentities(): Promise<User[]> {
    return this.devMode ? this.repo.listUsers() : [];
  }

  async getUser(did: string): Promise<User | null> {
    return this.repo.getUser(did);
  }

  async loadIdentity(): Promise<User | null> {
    const s = this.read();
    if (!s) return null;
    const user = this.toUser(s);
    await this.repo.saveUser(user); // 毎起動シードの repo へ自己ユーザーを復元
    return user;
  }

  async createIdentity(name: string): Promise<User> {
    const trimmed = name.trim();
    if (!trimmed) throw new Error("name is required");
    const id = await generateIdentity();
    const stored: StoredIdentity = {
      did: id.did,
      seedB64: seedToBase64(id.seed),
      name: trimmed,
      role: "admin", // 最初のユーザーは創設管理者（04_メンバー管理と権限.md）
    };
    this.write(stored);
    const user = this.toUser(stored);
    await this.repo.saveUser(user);
    return user;
  }

  async createPairingToken(): Promise<{ text: string; expiresAt: number }> {
    const s = this.read();
    if (!s) throw new Error("no identity to pair");
    const token = createPairingToken(PAIRING_TTL_MS, Date.now());
    const payload: PairingPayload = {
      v: 1,
      secret: token.secret,
      expiresAt: token.expiresAt,
      seedB64: s.seedB64,
      name: s.name,
      role: s.role,
      did: s.did,
    };
    return { text: encodePairingPayload(payload), expiresAt: token.expiresAt };
  }

  async completePairing(text: string): Promise<User> {
    const payload = decodePairingPayload(text);
    validatePairing(payload, Date.now());
    // シードから DID を再導出し payload.did と一致するか検証（破損/改竄検知）。
    const id = await identityFromSeed(seedFromBase64(payload.seedB64));
    if (id.did !== payload.did) {
      throw new PairingError("token_invalid", "did mismatch");
    }
    const role: Role =
      payload.role === "admin" ||
      payload.role === "editor" ||
      payload.role === "member"
        ? payload.role
        : "member";
    const stored: StoredIdentity = {
      did: id.did,
      seedB64: payload.seedB64,
      name: payload.name,
      role,
    };
    this.write(stored);
    const user = this.toUser(stored);
    await this.repo.saveUser(user);
    return user;
  }
}

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

  // dev はシードユーザーで常に「ID あり」。実 identity の作成・ペアリングは扱わない。
  async hasIdentity(): Promise<boolean> {
    return true;
  }

  async loadIdentity(): Promise<User | null> {
    return this.repo.getUser(this.realDid);
  }

  async createIdentity(): Promise<User> {
    throw new Error("createIdentity is not supported in DevIdentityService");
  }

  async createPairingToken(): Promise<{ text: string; expiresAt: number }> {
    throw new Error("pairing is not supported in DevIdentityService");
  }

  async completePairing(): Promise<User> {
    throw new Error("pairing is not supported in DevIdentityService");
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
