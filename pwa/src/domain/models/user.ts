// メンバー・ロール・メンバータグのドメインモデル。
// 仕様: docs/wants/04_メンバー管理と権限.md
// 参照実装: shared/domain/models/user.go
//
// メンバーグループ（旧 OrgGroup）概念は 2026-05-06 に廃止された。
// ロール・メンバータグでメンバー分類を表現する。

/** LinkSelf グループ内のロール。上位互換: admin > editor > member */
export type Role = "admin" | "editor" | "member";

const roleLevel: Record<Role, number> = {
  admin: 3,
  editor: 2,
  member: 1,
};

/** 自ロールが required 以上の権限を持つか判定する。 */
export function roleIsAtLeast(role: Role, required: Role): boolean {
  return roleLevel[role] >= roleLevel[required];
}

/** システム利用者。 */
export interface User {
  /** LinkSelf DID */
  id: string;
  /** 表示名 */
  name: string;
  role: Role;
  /** メンバータグIDリスト */
  tagIds: string[];
  /** 参加日時（ISO 8601） */
  joinedAt: string;
}

/** タグに自動割り当てするプリセット色（8色）。 */
export const TAG_COLOR_PALETTE: readonly string[] = [
  "#3b82f6",
  "#8b5cf6",
  "#ec4899",
  "#f97316",
  "#14b8a6",
  "#eab308",
  "#6366f1",
  "#f43f5e",
];

/** 編集メンバーが他のメンバーに付与するタグ。 */
export interface Tag {
  id: string;
  name: string;
  color: string;
}

const HEX_COLOR_RE = /^#[0-9a-fA-F]{6}$/;

/**
 * タグの入力値を検証し、不正なら英語のエラーメッセージを返す（正常時は null）。
 * - Name が空でないこと
 * - Name が 16 文字（コードポイント）以内であること
 * - Color が空か、#rrggbb 形式であること
 */
export function validateTag(tag: Tag): string | null {
  const nameLength = [...tag.name].length;
  if (nameLength === 0) {
    return "tag name must not be empty";
  }
  if (nameLength > 16) {
    return `tag name must be 16 characters or fewer (got ${nameLength})`;
  }
  if (tag.color !== "" && !HEX_COLOR_RE.test(tag.color)) {
    return `tag color must be empty or a valid #rrggbb hex color (got "${tag.color}")`;
  }
  return null;
}
