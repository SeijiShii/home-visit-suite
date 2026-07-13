// 網羅活動関連データの永続化インターフェース。
// 参照実装: shared/domain/coverage_repository.go

import type { Coverage } from "../models/coverage";

export interface CoverageRepository {
  // Coverage
  listCoverages(parentAreaId: string): Promise<Coverage[]>;
  getCoverage(id: string): Promise<Coverage | null>;
  saveCoverage(c: Coverage): Promise<void>;
  deleteCoverage(id: string): Promise<void>;
}
