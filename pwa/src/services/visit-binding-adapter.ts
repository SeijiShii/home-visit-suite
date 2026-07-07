// VisitBindingAPI（visit-service が要求する抽象、旧 Wails VisitBinding 相当）を
// CheckoutService（訪問記録の書き込み）と CheckoutRepository（読み取り）上に実装する。
// GetLastMetDate は Go binding（visit.go）と同じく「met のうち最新の visitedAt」。

import type { VisitRecord as DomainVisitRecord } from "../domain/models/visit";
import type { CheckoutService } from "./checkout-service";
import type { CheckoutRepository } from "../domain/repositories/checkout-repository";
import type { VisitBindingAPI, VisitRecord, VisitResult } from "./visit-service";

export class VisitBindingAdapter implements VisitBindingAPI {
  constructor(
    private checkoutService: CheckoutService,
    private checkoutRepo: CheckoutRepository,
  ) {}

  async RecordVisit(
    actorId: string,
    checkoutId: string,
    placeId: string,
    result: VisitResult,
    visitedAt: string,
    applicationText: string,
  ): Promise<VisitRecord> {
    const vr = await this.checkoutService.recordVisit(
      actorId,
      checkoutId,
      placeId,
      result,
      visitedAt,
      applicationText,
    );
    return vr as VisitRecord;
  }

  async RecordVisitPhase1(
    actorId: string,
    areaId: string,
    placeId: string,
    result: VisitResult,
    visitedAt: string,
    applicationText: string,
  ): Promise<VisitRecord> {
    const vr = await this.checkoutService.recordVisitAdHoc(
      actorId,
      areaId,
      placeId,
      result,
      visitedAt,
      applicationText,
    );
    return vr as VisitRecord;
  }

  async ListVisitRecords(areaId: string): Promise<VisitRecord[] | null> {
    const records = await this.checkoutRepo.listVisitRecords(areaId);
    return records as VisitRecord[];
  }

  async ListMyVisitHistory(placeId: string, userId: string): Promise<VisitRecord[] | null> {
    const records = await this.checkoutRepo.listMyVisitRecordsByPlace(placeId, userId);
    return records as VisitRecord[];
  }

  async GetLastMetDate(placeId: string): Promise<string | null> {
    const records = await this.checkoutRepo.listVisitRecordsByPlace(placeId);
    let latest: string | null = null;
    for (const vr of records as DomainVisitRecord[]) {
      if (vr.result !== "met") continue;
      if (latest === null || new Date(vr.visitedAt).getTime() > new Date(latest).getTime()) {
        latest = vr.visitedAt;
      }
    }
    return latest;
  }

  async DeleteVisitRecord(id: string): Promise<void> {
    await this.checkoutRepo.deleteVisitRecord(id);
  }
}
