// 区域招待のドメインモデル。
// 担当者ではない活動メンバーを、特定のチェックアウト区域に時間制限付きで参加させる仕組み。
// 仕様: docs/wants/05_チェックアウト.md「区域招待」
// 参照実装: shared/domain/models/checkout_invitation.go

/**
 * 区域招待のデフォルト有効期間（ミリ秒）。
 * 仕様: 「デフォルトは発行時刻から 24 時間」
 */
export const DEFAULT_CHECKOUT_INVITE_TTL_MS = 24 * 60 * 60 * 1000;

export interface CheckoutInvitation {
  id: string;
  checkoutId: string;
  /** 被招待者の DID（活動メンバー） */
  inviteeId: string;
  /** 発行者の DID（編集メンバー以上または当該チェックアウトの担当者） */
  inviterId: string;
  /** ISO 8601 */
  expiresAt: string;
  /** 取り消し時刻（ISO 8601）、未取消は null */
  revokedAt: string | null;
  /** ISO 8601 */
  createdAt: string;
}

/** now 時点で招待が有効か（取り消されておらず、期限切れでもない）を返す。 */
export function checkoutInvitationIsActive(inv: CheckoutInvitation, now: Date): boolean {
  if (inv.revokedAt !== null) {
    return false;
  }
  return now.getTime() < new Date(inv.expiresAt).getTime();
}
