// UserRepository の LinkSelf(MyDB SQL) 実装。
// メンバー表（users）とメンバータグ（member_tags）を MyDB の SQL テーブルに保存する。
// SQL 面は SqliteWasmDatabase（ブラウザでは OPFS SAHPool VFS）で永続し、
// ネットワーク配線時に `setSyncScope(table, "network")` で ScopeNetwork 化すると
// wireSqlSync のミラーが groupshare へルーティングされ全メンバーに伝播する
// （link-self Phase C。docs/wants/01「同期スコープ」）。
//
// invitations（ロール任命招待）は任命招待フローの廃止（2026-07-14、docs/wants/04
// 「任免」）によりドメイン的に使われないため、InMemory へ委譲する（同期しない）。

import type { MyDB } from "@linkself/core";
import type { Role, Tag, User } from "../../domain/models/user";
import type { UserRepository } from "../../domain/repositories/user-repository";
import type { Invitation } from "../../domain/models/invitation";
import { InMemoryUserRepository } from "../inmemory/inmemory-user-repository";

/** ScopeNetwork 化する対象テーブル（docs/wants/01 同期スコープ表の users 系）。 */
export const USER_SYNC_TABLES = ["users", "member_tags"] as const;

// スキーマ。各テーブルの先頭列を主キーにする（wireSqlSync が先頭列値を
// レコード ID として読み戻す規約）。version は同一 SQLite ファイルを共有する
// 他リポジトリと重複させない（1 = linkself-personal-repository）。
const MIGRATIONS = [
  {
    version: 2,
    sql: `
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        role TEXT NOT NULL,
        tag_ids TEXT NOT NULL,
        joined_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS member_tags (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        color TEXT NOT NULL
      );
    `,
  },
];

function rowToUser(row: Record<string, unknown>): User {
  const role = String(row.role ?? "");
  let tagIds: string[] = [];
  try {
    const parsed = JSON.parse(String(row.tag_ids ?? "[]")) as unknown;
    if (Array.isArray(parsed)) tagIds = parsed.map(String);
  } catch {
    // 壊れた tag_ids はタグなし扱い（表示不能にしない）
  }
  return {
    id: String(row.id ?? ""),
    name: String(row.name ?? ""),
    role: (role === "admin" || role === "editor" ? role : "member") as Role,
    tagIds,
    joinedAt: String(row.joined_at ?? ""),
  };
}

export class LinkSelfUserRepository implements UserRepository {
  // 招待は廃止済みフローのため非同期・非永続の InMemory に委譲する。
  private readonly inner = new InMemoryUserRepository();
  private migrated: Promise<void> | null = null;

  constructor(private readonly db: MyDB) {}

  private ensureMigrated(): Promise<void> {
    return (this.migrated ??= this.db.migrate(MIGRATIONS));
  }

  /**
   * スキーマを先行適用する。ScopeNetwork 昇格（includeExisting の SELECT）や
   * 初期データ移行の前に呼び、テーブル未作成での失敗を避ける。
   */
  ensureSchema(): Promise<void> {
    return this.ensureMigrated();
  }

  // ── User（users テーブル） ─────────────────────────────
  async listUsers(): Promise<User[]> {
    await this.ensureMigrated();
    const rows = await this.db.query("SELECT * FROM users");
    return rows.map(rowToUser);
  }

  async getUser(id: string): Promise<User | null> {
    await this.ensureMigrated();
    const rows = await this.db.query("SELECT * FROM users WHERE id = ?", [id]);
    return rows.length === 0 ? null : rowToUser(rows[0]!);
  }

  async saveUser(user: User): Promise<void> {
    await this.ensureMigrated();
    await this.db.exec(
      "INSERT OR REPLACE INTO users (id, name, role, tag_ids, joined_at) VALUES (?, ?, ?, ?, ?)",
      [
        user.id,
        user.name,
        user.role,
        JSON.stringify(user.tagIds),
        user.joinedAt,
      ],
    );
  }

  async deleteUser(id: string): Promise<void> {
    await this.ensureMigrated();
    await this.db.exec("DELETE FROM users WHERE id = ?", [id]);
  }

  // ── Tag（member_tags テーブル） ────────────────────────
  async listTags(): Promise<Tag[]> {
    await this.ensureMigrated();
    const rows = await this.db.query("SELECT * FROM member_tags");
    return rows.map((r) => ({
      id: String(r.id ?? ""),
      name: String(r.name ?? ""),
      color: String(r.color ?? ""),
    }));
  }

  async saveTag(tag: Tag): Promise<void> {
    await this.ensureMigrated();
    await this.db.exec(
      "INSERT OR REPLACE INTO member_tags (id, name, color) VALUES (?, ?, ?)",
      [tag.id, tag.name, tag.color],
    );
  }

  async deleteTag(id: string): Promise<void> {
    await this.ensureMigrated();
    await this.db.exec("DELETE FROM member_tags WHERE id = ?", [id]);
  }

  // ── Invitation（廃止フロー。InMemory 委譲） ─────────────
  listInvitations(inviteeId: string): Promise<Invitation[]> {
    return this.inner.listInvitations(inviteeId);
  }
  getInvitation(id: string): Promise<Invitation | null> {
    return this.inner.getInvitation(id);
  }
  saveInvitation(inv: Invitation): Promise<void> {
    return this.inner.saveInvitation(inv);
  }
}
