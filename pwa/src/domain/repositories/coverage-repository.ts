// 網羅活動関連データの永続化インターフェース。
// 参照実装: shared/domain/coverage_repository.go

import type { AvailablePeriod, AvailablePeriodTag } from "../models/available-period";
import type { Coverage } from "../models/coverage";

export interface CoverageRepository {
  // Coverage
  listCoverages(parentAreaId: string): Promise<Coverage[]>;
  getCoverage(id: string): Promise<Coverage | null>;
  saveCoverage(c: Coverage): Promise<void>;
  deleteCoverage(id: string): Promise<void>;

  // AvailablePeriod（チェックアウト可能期間、SchedulePeriod の後継）
  listAvailablePeriods(): Promise<AvailablePeriod[]>;
  getAvailablePeriod(id: string): Promise<AvailablePeriod | null>;
  /** 重複不可制約により最大1件、なければ null */
  getActiveAvailablePeriod(now: Date): Promise<AvailablePeriod | null>;
  saveAvailablePeriod(p: AvailablePeriod): Promise<void>;
  deleteAvailablePeriod(id: string): Promise<void>;

  // AvailablePeriodTag（AvailablePeriod 専用タグ、メンバータグとは別概念）
  listAvailablePeriodTags(): Promise<AvailablePeriodTag[]>;
  getAvailablePeriodTag(id: string): Promise<AvailablePeriodTag | null>;
  saveAvailablePeriodTag(t: AvailablePeriodTag): Promise<void>;
  deleteAvailablePeriodTag(id: string): Promise<void>;
}
