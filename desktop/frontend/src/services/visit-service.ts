/**
 * VisitRecord 型と VisitService の局所定義。
 * Wails generate 未実行のため shared/domain/models/visit.go と一致するインタフェースを定義する。
 * 仕様: docs/wants/08_活動メンバー向けアプリ.md
 */
import type { Coordinate } from "./place-service";

/** 訪問結果の 5 値 */
export type VisitResult =
  | "met" // 会えた
  | "absent" // 留守
  | "vacant_possible" // 空き家（入居の可能性あり）
  | "vacant_abandoned" // 空き家（廃屋）または更地
  | "refused"; // 訪問を望まない

/** 訪問結果ごとに申請（テキスト入力 + 編集メンバータスク化）を伴うか */
export function visitResultRequiresApplication(r: VisitResult): boolean {
  return r === "vacant_abandoned" || r === "refused";
}

/** 訪問結果すべての列挙（UI のスピナー表示順） */
export const VISIT_RESULTS: readonly VisitResult[] = [
  "met",
  "absent",
  "vacant_possible",
  "vacant_abandoned",
  "refused",
] as const;

export interface VisitRecord {
  id: string;
  userId: string;
  placeId: string;
  coord: Coordinate | null;
  areaId: string;
  activityId: string;
  result: VisitResult;
  appliedRequestId: string | null;
  visitedAt: string;
  createdAt: string;
  updatedAt: string;
}

/** VisitBinding API（Wails 自動生成の関数群に対応する型） */
export interface VisitBindingAPI {
  RecordVisit(
    actorID: string,
    activityID: string,
    placeID: string,
    result: VisitResult,
    visitedAt: string,
    applicationText: string,
  ): Promise<VisitRecord>;
  ListVisitRecords(areaID: string): Promise<VisitRecord[] | null>;
  ListMyVisitHistory(
    placeID: string,
    userID: string,
  ): Promise<VisitRecord[] | null>;
  GetLastMetDate(placeID: string): Promise<string | null>;
  DeleteVisitRecord(id: string): Promise<void>;
}

export class VisitService {
  constructor(private readonly api: VisitBindingAPI) {}

  async recordVisit(
    actorID: string,
    activityID: string,
    placeID: string,
    result: VisitResult,
    visitedAt: Date,
    applicationText: string,
  ): Promise<VisitRecord> {
    return await this.api.RecordVisit(
      actorID,
      activityID,
      placeID,
      result,
      visitedAt.toISOString(),
      applicationText,
    );
  }

  async listMyVisitHistory(
    placeID: string,
    userID: string,
  ): Promise<VisitRecord[]> {
    return (await this.api.ListMyVisitHistory(placeID, userID)) ?? [];
  }

  async getLastMetDate(placeID: string): Promise<Date | null> {
    const iso = await this.api.GetLastMetDate(placeID);
    return iso ? new Date(iso) : null;
  }

  async deleteVisitRecord(id: string): Promise<void> {
    await this.api.DeleteVisitRecord(id);
  }
}
