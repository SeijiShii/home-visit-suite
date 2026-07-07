// 招待・任命のドメインモデル。
// 仕様: docs/wants/04_メンバー管理と権限.md
// 参照実装: shared/domain/models/invitation.go

import type { Role } from "./user";

/** 招待の種別。 */
export type InvitationType =
  | "group_join" // LinkSelfグループ招待
  | "role_promote"; // ロール任命

/** 招待の状態。 */
export type InvitationStatus = "pending" | "accepted" | "declined";

/** 招待・任命。 */
export interface Invitation {
  id: string;
  type: InvitationType;
  status: InvitationStatus;
  /** 招待者のDID */
  inviterId: string;
  /** 対象者のDID */
  inviteeId: string;
  /** 任命先ロール */
  targetRole: Role;
  description: string;
  /** ISO 8601 */
  createdAt: string;
  /** ISO 8601 */
  resolvedAt: string | null;
}
