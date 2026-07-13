// CoverageRepository のインメモリ実装。
// LinkSelf TS アダプタが完成するまでの開発・テスト用。

import type { Coverage } from "../../domain/models/coverage";
import type { CoverageRepository } from "../../domain/repositories/coverage-repository";
import { backedMap } from "../localstorage/persistent-map";

export class InMemoryCoverageRepository implements CoverageRepository {
  private coverages: Map<string, Coverage>;

  constructor(storagePrefix?: string) {
    this.coverages = backedMap(storagePrefix, "coverages");
  }

  async listCoverages(parentAreaId: string): Promise<Coverage[]> {
    return [...this.coverages.values()]
      .filter((c) => c.parentAreaId === parentAreaId)
      .map((c) => ({ ...c }));
  }

  async getCoverage(id: string): Promise<Coverage | null> {
    const c = this.coverages.get(id);
    return c ? { ...c } : null;
  }

  async saveCoverage(c: Coverage): Promise<void> {
    this.coverages.set(c.id, { ...c });
  }

  async deleteCoverage(id: string): Promise<void> {
    this.coverages.delete(id);
  }
}
