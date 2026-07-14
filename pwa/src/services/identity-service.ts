// アイデンティティ（actor DID）解決サービス。
// desktop/frontend の Wails IdentityBinding 相当を PWA 向けに抽象化したもの。
// 本番実装は LinkSelf TS（自 DID の解決）を用いるアダプタに差し替える。

import type { Device } from "../domain/models/device";
import type { Role, User } from "../domain/models/user";
import type { UserRepository } from "../domain/repositories/user-repository";
import {
  generateIdentity,
  identityFromSeed,
  seedFromBase64,
  seedToBase64,
} from "../lib/identity-crypto";
import {
  buildPairingUrl,
  createPairingToken,
  decodePairingPayload,
  extractPairingPayloadParam,
  PairingError,
  validatePairing,
  type PairingPayload,
} from "../lib/pairing";
import { ServiceError } from "./errors";

/**
 * 表示名がメンバー表内で他ユーザーと衝突しないか検証する（衝突時 already_exists）。
 * サーバーレス P2P のため検証はローカルのメンバー表に対するもの
 * （docs/wants/01「表示名の変更」）。
 */
async function assertNameAvailable(
  repo: UserRepository,
  selfId: string,
  name: string,
): Promise<void> {
  const users = await repo.listUsers();
  if (users.some((u) => u.id !== selfId && u.name === name)) {
    throw new ServiceError("already_exists", `display name taken: ${name}`);
  }
}

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
  /**
   * 新しい identity を生成し、自分のユーザーを作成する。role 省略時は創設＝管理者
   * （オンボーディング）。招待経由の参加では "member" で作成し、参加成立時に
   * setRole で招待ロールを採用する（JoinPage）。
   */
  createIdentity(name: string, role?: Role): Promise<User>;
  /**
   * 自分のロールを変更して保存する（グループ参加成立時に招待ロールを採用する等）。
   * identity 未作成なら例外。
   */
  setRole(role: Role): Promise<User>;
  /**
   * 自分の表示名を変更して保存する（設定画面のプロフィール）。identity と
   * 自分の User レコードの両方を更新する（タグ・参加日時は保持）。
   */
  setName(name: string): Promise<User>;
  /** この ID に別端末を追加するためのペアリング用 URL（QR 内容）を作る。 */
  createPairingToken(): Promise<{ url: string; expiresAt: number }>;
  /** ペアリング URL / コードを取り込み、同一 identity を復元してユーザーを返す。 */
  completePairing(input: string): Promise<User>;
  /** この端末の deviceId を返す。 */
  getCurrentDeviceId(): Promise<string>;
  /** 自分の ID に紐づくデバイス一覧を返す。 */
  listDevices(): Promise<Device[]>;
  /** デバイスのラベルを変更する。 */
  renameDevice(deviceId: string, label: string): Promise<void>;
  /** 当該デバイス以外を削除する（当該デバイスの指定は拒否）。 */
  removeDevice(deviceId: string): Promise<void>;
}

const DEV_ACTOR_KEY = "dev.identity.actor";
/** 自分の identity（did / 秘密鍵シード / 表示名 / ロール）の localStorage キー。 */
const IDENTITY_KEY = "hvs.identity";
/** この端末の deviceId の localStorage キー。 */
const DEVICE_ID_KEY = "hvs.deviceId";
/** デバイス登録簿（暫定 localStorage、M5 で同期リポジトリへ移行）の localStorage キー。 */
const DEVICES_KEY = "hvs.devices";
/** ペアリングトークンの有効期限（5分）。 */
const PAIRING_TTL_MS = 5 * 60_000;

/** ランダムな deviceId を生成する。 */
function newDeviceId(): string {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  let hex = "";
  for (const b of bytes) hex += b.toString(16).padStart(2, "0");
  return `dev-${hex}`;
}

interface StoredIdentity {
  did: string;
  seedB64: string;
  name: string;
  role: Role;
}

/**
 * 保存済み実 identity の 32byte Ed25519 シードを返す（未作成なら null）。
 * LinkSelf クライアントを実 identity で起動する配線（M5 ネットワーク）で使う。
 * localStorage(`hvs.identity`) を直接読むのは、サービス束が identityService より
 * 先に構築されるため（main.tsx bootstrap）。
 */
export function loadStoredSeed(): Uint8Array | null {
  try {
    const raw = localStorage.getItem(IDENTITY_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as StoredIdentity;
    return s.seedB64 ? seedFromBase64(s.seedB64) : null;
  } catch {
    return null;
  }
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

  private ensureDeviceId(): string {
    try {
      let id = localStorage.getItem(DEVICE_ID_KEY);
      if (!id) {
        id = newDeviceId();
        localStorage.setItem(DEVICE_ID_KEY, id);
      }
      return id;
    } catch {
      return "dev-local";
    }
  }

  private readDevices(): Device[] {
    try {
      const raw = localStorage.getItem(DEVICES_KEY);
      return raw ? (JSON.parse(raw) as Device[]) : [];
    } catch {
      return [];
    }
  }

  private writeDevices(list: Device[]): void {
    try {
      localStorage.setItem(DEVICES_KEY, JSON.stringify(list));
    } catch {
      // ignore
    }
  }

  /**
   * 新規作成/ペアリング時: この端末を登録簿へ upsert する。
   * デバイス登録簿は ScopeDevice（同一ユーザーの端末間で同期）を想定するため、
   * reset せず「同一ユーザーの他端末エントリを保持しつつ自端末を upsert」する
   * （同期導入=M5 で他端末の登録が消えないよう前方互換にする。自端末のラベル/
   * 登録日時は既存があれば温存）。docs/wants/01_共通基盤.md「同期スコープ」参照。
   */
  private registerThisDevice(userId: string): void {
    const id = this.ensureDeviceId();
    const list = this.readDevices();
    const existing = list.find((d) => d.id === id);
    const others = list.filter((d) => d.userId === userId && d.id !== id);
    this.writeDevices([
      ...others,
      {
        id,
        userId,
        label: existing?.label ?? "",
        createdAt: existing?.createdAt ?? new Date().toISOString(),
      },
    ]);
  }

  /** 起動復元時: ラベル等を壊さず、この端末が登録簿に無ければ追加する。 */
  private ensureThisDeviceListed(userId: string): void {
    const id = this.ensureDeviceId();
    const list = this.readDevices();
    if (!list.some((d) => d.id === id)) {
      list.push({ id, userId, label: "", createdAt: new Date().toISOString() });
      this.writeDevices(list);
    }
  }

  async hasIdentity(): Promise<boolean> {
    return this.read() !== null;
  }

  async getRealDID(): Promise<string> {
    return this.read()?.did ?? "";
  }

  async getCurrentActor(): Promise<string> {
    // dev の identity 切替が無効なときは残骸の DEV_ACTOR_KEY を参照しない。
    if (this.devMode) {
      try {
        const stored = localStorage.getItem(DEV_ACTOR_KEY);
        if (stored && (await this.repo.getUser(stored))) return stored;
      } catch {
        // ignore
      }
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
    this.ensureThisDeviceListed(s.did);
    return user;
  }

  async createIdentity(name: string, role: Role = "admin"): Promise<User> {
    const trimmed = name.trim();
    if (!trimmed) throw new Error("name is required");
    const id = await generateIdentity();
    const stored: StoredIdentity = {
      did: id.did,
      seedB64: seedToBase64(id.seed),
      name: trimmed,
      // 既定は創設管理者（04_メンバー管理と権限.md）。招待参加は "member" で
      // 作成し、参加成立時に setRole で招待ロールを採用する。
      role,
    };
    this.write(stored);
    this.registerThisDevice(stored.did);
    const user = this.toUser(stored);
    await this.repo.saveUser(user);
    return user;
  }

  async setRole(role: Role): Promise<User> {
    const s = this.read();
    if (!s) throw new Error("no identity");
    const stored: StoredIdentity = { ...s, role };
    this.write(stored);
    const user = this.toUser(stored);
    await this.repo.saveUser(user);
    return user;
  }

  async setName(name: string): Promise<User> {
    const trimmed = name.trim();
    if (!trimmed) throw new Error("name is required");
    const s = this.read();
    if (!s) throw new Error("no identity");
    await assertNameAvailable(this.repo, s.did, trimmed);
    const stored: StoredIdentity = { ...s, name: trimmed };
    this.write(stored);
    // 既存レコードのタグ・参加日時を保持して upsert する。
    const existing = await this.repo.getUser(s.did);
    const user: User = {
      ...this.toUser(stored),
      tagIds: existing?.tagIds ?? [],
      joinedAt: existing?.joinedAt ?? new Date().toISOString(),
    };
    await this.repo.saveUser(user);
    return user;
  }

  async createPairingToken(): Promise<{ url: string; expiresAt: number }> {
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
    // ペアリング URL のベース。env で正規の公開 URL を上書きでき（プロキシ/独自ドメイン、
    // localhost からスキャンできない開発時など）、未設定なら実行時オリジンにフォールバックする。
    const baseUrl =
      (import.meta.env.VITE_PAIRING_BASE_URL as string | undefined) ||
      window.location.origin + import.meta.env.BASE_URL;
    return {
      url: buildPairingUrl(baseUrl, payload),
      expiresAt: token.expiresAt,
    };
  }

  async completePairing(input: string): Promise<User> {
    const payload = decodePairingPayload(extractPairingPayloadParam(input));
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
    this.registerThisDevice(stored.did);
    const user = this.toUser(stored);
    await this.repo.saveUser(user);
    return user;
  }

  async getCurrentDeviceId(): Promise<string> {
    return this.ensureDeviceId();
  }

  async listDevices(): Promise<Device[]> {
    const s = this.read();
    if (!s) return [];
    return this.readDevices().filter((d) => d.userId === s.did);
  }

  async renameDevice(deviceId: string, label: string): Promise<void> {
    const list = this.readDevices().map((d) =>
      d.id === deviceId ? { ...d, label: label.trim() } : d,
    );
    this.writeDevices(list);
  }

  async removeDevice(deviceId: string): Promise<void> {
    // 当該デバイス自身は削除できない（削除は自分以外の端末のみ）。
    // 削除＝同一ユーザーのデバイス集合（同期ロスター）から外す＝以後同期しない。
    // 鍵は端末に残るため、再度ペアリング URL を渡せば再登録（再同期）できる。
    if (deviceId === this.ensureDeviceId()) {
      throw new Error("cannot remove the current device");
    }
    this.writeDevices(this.readDevices().filter((d) => d.id !== deviceId));
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

  async setRole(): Promise<User> {
    throw new Error("setRole is not supported in DevIdentityService");
  }

  /** dev では現アクターの User レコード名を更新する（シードユーザーの改名確認用）。 */
  async setName(name: string): Promise<User> {
    const trimmed = name.trim();
    if (!trimmed) throw new Error("name is required");
    const did = await this.getCurrentActor();
    const user = await this.repo.getUser(did);
    if (!user) throw new Error(`user not found: ${did}`);
    await assertNameAvailable(this.repo, did, trimmed);
    const renamed = { ...user, name: trimmed };
    await this.repo.saveUser(renamed);
    return renamed;
  }

  async createPairingToken(): Promise<{ url: string; expiresAt: number }> {
    throw new Error("pairing is not supported in DevIdentityService");
  }

  async completePairing(): Promise<User> {
    throw new Error("pairing is not supported in DevIdentityService");
  }

  async getCurrentDeviceId(): Promise<string> {
    return "dev-device";
  }

  async listDevices(): Promise<Device[]> {
    return [];
  }

  async renameDevice(): Promise<void> {
    // no-op
  }

  async removeDevice(): Promise<void> {
    // no-op
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
