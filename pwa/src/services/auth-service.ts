// 権限管理のビジネスロジック。
// 仕様: docs/wants/04_メンバー管理と権限.md
// 参照実装: shared/service/auth.go / auth_impl.go

import type { Invitation } from "../domain/models/invitation";
import { type Role, roleIsAtLeast } from "../domain/models/user";
import type { UserRepository } from "../domain/repositories/user-repository";
import { ServiceError } from "./errors";
import { newId } from "./id";

/** 操作ごとの最低ロール。 */
const ACTION_MIN_ROLE: Record<string, Role> = {
  manage_users: "admin",
  edit_areas: "editor",
  checkout: "member",
  visit: "member",
};

export interface AuthService {
  /** 指定ロールが操作を実行できるか判定する。 */
  canPerform(actor: Role, action: string): boolean;

  /** ロール任命招待を送る。editor+ のみ。 */
  inviteToRole(actorId: string, targetId: string, newRole: Role): Promise<Invitation>;

  /** 招待を受理する（被招待者本人のみ）。 */
  acceptInvitation(actorId: string, invitationId: string): Promise<void>;

  /**
   * ロール降格を行う。admin のみ。
   * 管理者の自己罷免は不可。最後の管理者の罷免も不可。
   */
  dismissRole(actorId: string, targetId: string, newRole: Role): Promise<void>;

  /** メンバーをグループから削除する。admin のみ。 */
  removeMember(actorId: string, targetId: string): Promise<void>;
}

export class AuthServiceImpl implements AuthService {
  constructor(
    private userRepo: UserRepository,
    private nowFn: () => Date = () => new Date(),
  ) {}

  canPerform(actor: Role, action: string): boolean {
    const minRole = ACTION_MIN_ROLE[action];
    if (!minRole) return false;
    return roleIsAtLeast(actor, minRole);
  }

  async inviteToRole(actorId: string, targetId: string, newRole: Role): Promise<Invitation> {
    const actor = await this.userRepo.getUser(actorId);
    if (!actor) {
      throw new ServiceError("not_found", `actor not found: ${actorId}`);
    }
    if (!roleIsAtLeast(actor.role, "editor")) {
      throw new ServiceError("permission_denied", "invite requires editor or above");
    }

    const inv: Invitation = {
      id: newId("inv"),
      type: "role_promote",
      status: "pending",
      inviterId: actorId,
      inviteeId: targetId,
      targetRole: newRole,
      description: "",
      createdAt: this.nowFn().toISOString(),
      resolvedAt: null,
    };

    await this.userRepo.saveInvitation(inv);
    return inv;
  }

  async acceptInvitation(actorId: string, invitationId: string): Promise<void> {
    const inv = await this.userRepo.getInvitation(invitationId);
    if (!inv) {
      throw new ServiceError("not_found", `invitation not found: ${invitationId}`);
    }

    if (inv.inviteeId !== actorId) {
      throw new ServiceError("permission_denied", "only the invitee can accept");
    }

    if (inv.status !== "pending") {
      throw new ServiceError(
        "invalid_state",
        `invitation is not pending (status: ${inv.status})`,
      );
    }

    // ロール変更
    const user = await this.userRepo.getUser(actorId);
    if (!user) {
      throw new ServiceError("not_found", `user not found: ${actorId}`);
    }
    await this.userRepo.saveUser({ ...user, role: inv.targetRole });

    // 招待ステータス更新
    await this.userRepo.saveInvitation({
      ...inv,
      status: "accepted",
      resolvedAt: this.nowFn().toISOString(),
    });
  }

  async dismissRole(actorId: string, targetId: string, newRole: Role): Promise<void> {
    // 自己罷免チェック
    if (actorId === targetId) {
      throw new ServiceError("self_dismissal", "cannot dismiss yourself");
    }

    const actor = await this.userRepo.getUser(actorId);
    if (!actor) {
      throw new ServiceError("not_found", `actor not found: ${actorId}`);
    }
    if (!roleIsAtLeast(actor.role, "admin")) {
      throw new ServiceError("permission_denied", "dismiss requires admin");
    }

    const target = await this.userRepo.getUser(targetId);
    if (!target) {
      throw new ServiceError("not_found", `target not found: ${targetId}`);
    }

    // 最後の管理者チェック
    if (target.role === "admin") {
      const users = await this.userRepo.listUsers();
      const adminCount = users.filter((u) => u.role === "admin").length;
      if (adminCount <= 1) {
        throw new ServiceError("last_admin", "cannot dismiss the last admin");
      }
    }

    await this.userRepo.saveUser({ ...target, role: newRole });
  }

  async removeMember(actorId: string, targetId: string): Promise<void> {
    const actor = await this.userRepo.getUser(actorId);
    if (!actor) {
      throw new ServiceError("not_found", `actor not found: ${actorId}`);
    }
    if (actor.role !== "admin") {
      throw new ServiceError("permission_denied", "remove member requires admin");
    }

    await this.userRepo.deleteUser(targetId);
  }
}
