// 権限管理のビジネスロジック。
// 仕様: docs/wants/04_メンバー管理と権限.md「任免（メンバーの編集と削除）」
// 参照実装: shared/service/auth.go / auth_impl.go
//
// 2026-07-14 改訂: 任命招待（受理で成立）フローは廃止し、管理者による直接変更
// （updateMember）に統一した。旧 inviteToRole / acceptInvitation / dismissRole は削除。

import { type Role, roleIsAtLeast } from "../domain/models/user";
import type { UserRepository } from "../domain/repositories/user-repository";
import { ServiceError } from "./errors";

/** 操作ごとの最低ロール。 */
const ACTION_MIN_ROLE: Record<string, Role> = {
  manage_users: "admin",
  edit_areas: "editor",
  checkout: "member",
  visit: "member",
};

/** メンバー編集の変更内容（指定したフィールドのみ変更する）。 */
export interface MemberPatch {
  /** 新しい表示名（trim 後に空なら invalid_input）。 */
  name?: string;
  /** 新しいロール（自分自身への変更は self_dismissal）。 */
  role?: Role;
}

export interface AuthService {
  /** 指定ロールが操作を実行できるか判定する。 */
  canPerform(actor: Role, action: string): boolean;

  /**
   * メンバーの表示名・ロールを直接変更する。admin のみ。
   * 自分自身のロール変更は不可（管理者0人防止。表示名のみの変更は可）。
   */
  updateMember(
    actorId: string,
    targetId: string,
    patch: MemberPatch,
  ): Promise<void>;

  /** メンバーをグループから削除する。admin のみ。自分自身は削除不可。 */
  removeMember(actorId: string, targetId: string): Promise<void>;
}

export class AuthServiceImpl implements AuthService {
  constructor(private userRepo: UserRepository) {}

  canPerform(actor: Role, action: string): boolean {
    const minRole = ACTION_MIN_ROLE[action];
    if (!minRole) return false;
    return roleIsAtLeast(actor, minRole);
  }

  async updateMember(
    actorId: string,
    targetId: string,
    patch: MemberPatch,
  ): Promise<void> {
    const actor = await this.userRepo.getUser(actorId);
    if (!actor) {
      throw new ServiceError("not_found", `actor not found: ${actorId}`);
    }
    if (actor.role !== "admin") {
      throw new ServiceError(
        "permission_denied",
        "update member requires admin",
      );
    }

    const target = await this.userRepo.getUser(targetId);
    if (!target) {
      throw new ServiceError("not_found", `target not found: ${targetId}`);
    }

    const next = { ...target };

    if (patch.name !== undefined) {
      const name = patch.name.trim();
      if (!name) {
        throw new ServiceError(
          "invalid_input",
          "display name must not be empty",
        );
      }
      next.name = name;
    }

    if (patch.role !== undefined && patch.role !== target.role) {
      // 自己ロール変更は不可（管理者0人の状態を防止）。
      if (actorId === targetId) {
        throw new ServiceError("self_dismissal", "cannot change own role");
      }
      // 防御的ガード: 最後の管理者の降格は不可。通常フローでは自己ロール変更
      // チェックが先に働くため到達しない（actor が admin である以上、別の admin
      // を降格しても管理者は 1 名以上残る）。
      if (target.role === "admin" && patch.role !== "admin") {
        const users = await this.userRepo.listUsers();
        const adminCount = users.filter((u) => u.role === "admin").length;
        if (adminCount <= 1) {
          throw new ServiceError("last_admin", "cannot demote the last admin");
        }
      }
      next.role = patch.role;
    }

    await this.userRepo.saveUser(next);
  }

  async removeMember(actorId: string, targetId: string): Promise<void> {
    // 自己削除は不可（自己罷免不可の原則）。
    if (actorId === targetId) {
      throw new ServiceError("self_dismissal", "cannot remove yourself");
    }

    const actor = await this.userRepo.getUser(actorId);
    if (!actor) {
      throw new ServiceError("not_found", `actor not found: ${actorId}`);
    }
    if (actor.role !== "admin") {
      throw new ServiceError(
        "permission_denied",
        "remove member requires admin",
      );
    }

    await this.userRepo.deleteUser(targetId);
  }
}
