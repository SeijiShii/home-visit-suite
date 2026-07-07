// チェックアウト関連データの永続化インターフェース。
// 参照実装: shared/domain/checkout_repository.go

import type { CheckoutInvitation } from "../models/checkout-invitation";
import type { Checkout, VisitRecord } from "../models/visit";
import type { VisitRecordEdit } from "../models/visit-edit";

export interface CheckoutRepository {
  // Checkout
  listCheckouts(areaId: string): Promise<Checkout[]>;
  /** 全区域のチェックアウト履歴（管理画面 /checkouts 用） */
  listAllCheckouts(): Promise<Checkout[]>;
  getCheckout(id: string): Promise<Checkout | null>;
  /** 排他的貸出: アクティブなチェックアウトを取得 */
  getActiveCheckout(areaId: string): Promise<Checkout | null>;
  /** 担当者として持つアクティブなチェックアウト（ダッシュボード「アクセス可能な区域」用） */
  listActiveCheckoutsForPersonInCharge(personInChargeId: string): Promise<Checkout[]>;
  saveCheckout(checkout: Checkout): Promise<void>;
  deleteCheckout(id: string): Promise<void>;

  // CheckoutInvitation（区域招待）
  getCheckoutInvitation(id: string): Promise<CheckoutInvitation | null>;
  /** 同一被招待者重複検出（上書き延長用） */
  getCheckoutInvitationByPair(
    checkoutId: string,
    inviteeId: string,
  ): Promise<CheckoutInvitation | null>;
  listCheckoutInvitations(checkoutId: string): Promise<CheckoutInvitation[]>;
  /** 被招待者のアクセス可能区域算出用（取消済み除外。期限切れフィルタは呼び出し側） */
  listActiveCheckoutInvitationsForInvitee(inviteeId: string): Promise<CheckoutInvitation[]>;
  saveCheckoutInvitation(inv: CheckoutInvitation): Promise<void>;

  // VisitRecord
  listVisitRecords(areaId: string): Promise<VisitRecord[]>;
  /** 場所単位の全ネットワーク訪問記録（最近会えた日付の集計用） */
  listVisitRecordsByPlace(placeId: string): Promise<VisitRecord[]>;
  /** 場所単位の個人訪問履歴 */
  listMyVisitRecordsByPlace(placeId: string, userId: string): Promise<VisitRecord[]>;
  getVisitRecord(id: string): Promise<VisitRecord | null>;
  saveVisitRecord(vr: VisitRecord): Promise<void>;
  deleteVisitRecord(id: string): Promise<void>;

  // VisitRecordEdit
  listVisitRecordEdits(visitRecordId: string): Promise<VisitRecordEdit[]>;
  saveVisitRecordEdit(edit: VisitRecordEdit): Promise<void>;
}
