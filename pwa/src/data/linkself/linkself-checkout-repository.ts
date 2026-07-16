// CheckoutRepository の LinkSelf(MyDB SQL) 実装。
// チェックアウト/区域招待/訪問記録/訪問記録編集履歴を JSON 行テーブル
// （checkouts/checkout_invitations/visit_records/visit_record_edits）に保存する。
// ネットワーク配線時は ScopeNetwork で全メンバーへ伝播する（docs/wants/01「同期スコープ」）。

import type { MyDB } from "@linkself/core";
import type { CheckoutInvitation } from "../../domain/models/checkout-invitation";
import type { Checkout, VisitRecord } from "../../domain/models/visit";
import type { VisitRecordEdit } from "../../domain/models/visit-edit";
import type { CheckoutRepository } from "../../domain/repositories/checkout-repository";
import { deleteRow, getRow, listRows, putRow } from "./group-schema";

export class LinkSelfCheckoutRepository implements CheckoutRepository {
  constructor(private readonly db: MyDB) {}

  // ── チェックアウト ─────────────────────────────
  async listCheckouts(areaId: string): Promise<Checkout[]> {
    return (await listRows<Checkout>(this.db, "checkouts")).filter(
      (c) => c.areaId === areaId,
    );
  }

  listAllCheckouts(): Promise<Checkout[]> {
    return listRows<Checkout>(this.db, "checkouts");
  }

  getCheckout(id: string): Promise<Checkout | null> {
    return getRow<Checkout>(this.db, "checkouts", id);
  }

  async getActiveCheckout(areaId: string): Promise<Checkout | null> {
    const all = await listRows<Checkout>(this.db, "checkouts");
    return (
      all.find((c) => c.areaId === areaId && c.status === "active") ?? null
    );
  }

  async listActiveCheckoutsForPersonInCharge(
    personInChargeId: string,
  ): Promise<Checkout[]> {
    return (await listRows<Checkout>(this.db, "checkouts")).filter(
      (c) => c.personInChargeId === personInChargeId && c.status === "active",
    );
  }

  saveCheckout(checkout: Checkout): Promise<void> {
    return putRow(this.db, "checkouts", checkout.id, checkout);
  }

  deleteCheckout(id: string): Promise<void> {
    return deleteRow(this.db, "checkouts", id);
  }

  // ── 区域招待 ─────────────────────────────────
  getCheckoutInvitation(id: string): Promise<CheckoutInvitation | null> {
    return getRow<CheckoutInvitation>(this.db, "checkout_invitations", id);
  }

  async getCheckoutInvitationByPair(
    checkoutId: string,
    inviteeId: string,
  ): Promise<CheckoutInvitation | null> {
    const all = await listRows<CheckoutInvitation>(
      this.db,
      "checkout_invitations",
    );
    return (
      all.find(
        (inv) => inv.checkoutId === checkoutId && inv.inviteeId === inviteeId,
      ) ?? null
    );
  }

  async listCheckoutInvitations(
    checkoutId: string,
  ): Promise<CheckoutInvitation[]> {
    return (
      await listRows<CheckoutInvitation>(this.db, "checkout_invitations")
    ).filter((inv) => inv.checkoutId === checkoutId);
  }

  async listActiveCheckoutInvitationsForInvitee(
    inviteeId: string,
  ): Promise<CheckoutInvitation[]> {
    // 取消済みは除外。期限切れフィルタは呼び出し側の責務。
    return (
      await listRows<CheckoutInvitation>(this.db, "checkout_invitations")
    ).filter((inv) => inv.inviteeId === inviteeId && inv.revokedAt === null);
  }

  saveCheckoutInvitation(inv: CheckoutInvitation): Promise<void> {
    return putRow(this.db, "checkout_invitations", inv.id, inv);
  }

  // ── 訪問記録 ─────────────────────────────────
  async listVisitRecords(areaId: string): Promise<VisitRecord[]> {
    return (await listRows<VisitRecord>(this.db, "visit_records")).filter(
      (vr) => vr.areaId === areaId,
    );
  }

  async listVisitRecordsByPlace(placeId: string): Promise<VisitRecord[]> {
    return (await listRows<VisitRecord>(this.db, "visit_records")).filter(
      (vr) => vr.placeId === placeId,
    );
  }

  async listMyVisitRecordsByPlace(
    placeId: string,
    userId: string,
  ): Promise<VisitRecord[]> {
    return (await listRows<VisitRecord>(this.db, "visit_records")).filter(
      (vr) => vr.placeId === placeId && vr.userId === userId,
    );
  }

  getVisitRecord(id: string): Promise<VisitRecord | null> {
    return getRow<VisitRecord>(this.db, "visit_records", id);
  }

  saveVisitRecord(vr: VisitRecord): Promise<void> {
    return putRow(this.db, "visit_records", vr.id, vr);
  }

  deleteVisitRecord(id: string): Promise<void> {
    return deleteRow(this.db, "visit_records", id);
  }

  // ── 訪問記録の編集履歴 ─────────────────────────
  async listVisitRecordEdits(
    visitRecordId: string,
  ): Promise<VisitRecordEdit[]> {
    return (
      await listRows<VisitRecordEdit>(this.db, "visit_record_edits")
    ).filter((e) => e.visitRecordId === visitRecordId);
  }

  saveVisitRecordEdit(edit: VisitRecordEdit): Promise<void> {
    return putRow(this.db, "visit_record_edits", edit.id, edit);
  }
}
