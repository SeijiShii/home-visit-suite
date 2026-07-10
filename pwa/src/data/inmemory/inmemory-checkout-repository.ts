// CheckoutRepository のインメモリ実装。
// LinkSelf TS アダプタが完成するまでの開発・テスト用。

import type { CheckoutInvitation } from "../../domain/models/checkout-invitation";
import type { Checkout, VisitRecord } from "../../domain/models/visit";
import type { VisitRecordEdit } from "../../domain/models/visit-edit";
import type { CheckoutRepository } from "../../domain/repositories/checkout-repository";
import { backedMap } from "../localstorage/persistent-map";

export class InMemoryCheckoutRepository implements CheckoutRepository {
  private checkouts: Map<string, Checkout>;
  private invitations: Map<string, CheckoutInvitation>;
  private visitRecords: Map<string, VisitRecord>;
  private visitRecordEdits: Map<string, VisitRecordEdit>;

  constructor(storagePrefix?: string) {
    this.checkouts = backedMap(storagePrefix, "checkouts");
    this.invitations = backedMap(storagePrefix, "invitations");
    this.visitRecords = backedMap(storagePrefix, "visitRecords");
    this.visitRecordEdits = backedMap(storagePrefix, "visitRecordEdits");
  }

  async listCheckouts(areaId: string): Promise<Checkout[]> {
    return [...this.checkouts.values()]
      .filter((c) => c.areaId === areaId)
      .map((c) => ({ ...c }));
  }

  async listAllCheckouts(): Promise<Checkout[]> {
    return [...this.checkouts.values()].map((c) => ({ ...c }));
  }

  async getCheckout(id: string): Promise<Checkout | null> {
    const c = this.checkouts.get(id);
    return c ? { ...c } : null;
  }

  async getActiveCheckout(areaId: string): Promise<Checkout | null> {
    for (const c of this.checkouts.values()) {
      if (c.areaId === areaId && c.status === "active") {
        return { ...c };
      }
    }
    return null;
  }

  async listActiveCheckoutsForPersonInCharge(
    personInChargeId: string,
  ): Promise<Checkout[]> {
    return [...this.checkouts.values()]
      .filter(
        (c) => c.personInChargeId === personInChargeId && c.status === "active",
      )
      .map((c) => ({ ...c }));
  }

  async saveCheckout(checkout: Checkout): Promise<void> {
    this.checkouts.set(checkout.id, { ...checkout });
  }

  async deleteCheckout(id: string): Promise<void> {
    this.checkouts.delete(id);
  }

  async getCheckoutInvitation(id: string): Promise<CheckoutInvitation | null> {
    const inv = this.invitations.get(id);
    return inv ? { ...inv } : null;
  }

  async getCheckoutInvitationByPair(
    checkoutId: string,
    inviteeId: string,
  ): Promise<CheckoutInvitation | null> {
    for (const inv of this.invitations.values()) {
      if (inv.checkoutId === checkoutId && inv.inviteeId === inviteeId) {
        return { ...inv };
      }
    }
    return null;
  }

  async listCheckoutInvitations(
    checkoutId: string,
  ): Promise<CheckoutInvitation[]> {
    return [...this.invitations.values()]
      .filter((inv) => inv.checkoutId === checkoutId)
      .map((inv) => ({ ...inv }));
  }

  async listActiveCheckoutInvitationsForInvitee(
    inviteeId: string,
  ): Promise<CheckoutInvitation[]> {
    // 取消済みは除外。期限切れフィルタは呼び出し側の責務。
    return [...this.invitations.values()]
      .filter((inv) => inv.inviteeId === inviteeId && inv.revokedAt === null)
      .map((inv) => ({ ...inv }));
  }

  async saveCheckoutInvitation(inv: CheckoutInvitation): Promise<void> {
    this.invitations.set(inv.id, { ...inv });
  }

  async listVisitRecords(areaId: string): Promise<VisitRecord[]> {
    return [...this.visitRecords.values()]
      .filter((vr) => vr.areaId === areaId)
      .map(cloneVisitRecord);
  }

  async listVisitRecordsByPlace(placeId: string): Promise<VisitRecord[]> {
    return [...this.visitRecords.values()]
      .filter((vr) => vr.placeId === placeId)
      .map(cloneVisitRecord);
  }

  async listMyVisitRecordsByPlace(
    placeId: string,
    userId: string,
  ): Promise<VisitRecord[]> {
    return [...this.visitRecords.values()]
      .filter((vr) => vr.placeId === placeId && vr.userId === userId)
      .map(cloneVisitRecord);
  }

  async getVisitRecord(id: string): Promise<VisitRecord | null> {
    const vr = this.visitRecords.get(id);
    return vr ? cloneVisitRecord(vr) : null;
  }

  async saveVisitRecord(vr: VisitRecord): Promise<void> {
    this.visitRecords.set(vr.id, cloneVisitRecord(vr));
  }

  async deleteVisitRecord(id: string): Promise<void> {
    this.visitRecords.delete(id);
  }

  async listVisitRecordEdits(
    visitRecordId: string,
  ): Promise<VisitRecordEdit[]> {
    return [...this.visitRecordEdits.values()]
      .filter((e) => e.visitRecordId === visitRecordId)
      .map((e) => ({ ...e }));
  }

  async saveVisitRecordEdit(edit: VisitRecordEdit): Promise<void> {
    this.visitRecordEdits.set(edit.id, { ...edit });
  }
}

function cloneVisitRecord(vr: VisitRecord): VisitRecord {
  return { ...vr, coord: vr.coord ? { ...vr.coord } : null };
}
