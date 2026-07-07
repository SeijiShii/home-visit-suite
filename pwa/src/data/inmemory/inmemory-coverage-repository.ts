// CoverageRepository のインメモリ実装。
// LinkSelf TS アダプタが完成するまでの開発・テスト用。

import {
  type AvailablePeriod,
  type AvailablePeriodTag,
  availablePeriodIsActive,
} from "../../domain/models/available-period";
import type { Coverage } from "../../domain/models/coverage";
import type { CoverageRepository } from "../../domain/repositories/coverage-repository";

export class InMemoryCoverageRepository implements CoverageRepository {
  private coverages = new Map<string, Coverage>();
  private periods = new Map<string, AvailablePeriod>();
  private tags = new Map<string, AvailablePeriodTag>();

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

  async listAvailablePeriods(): Promise<AvailablePeriod[]> {
    return [...this.periods.values()].map(clonePeriod);
  }

  async getAvailablePeriod(id: string): Promise<AvailablePeriod | null> {
    const p = this.periods.get(id);
    return p ? clonePeriod(p) : null;
  }

  async getActiveAvailablePeriod(now: Date): Promise<AvailablePeriod | null> {
    for (const p of this.periods.values()) {
      if (availablePeriodIsActive(p, now)) {
        return clonePeriod(p);
      }
    }
    return null;
  }

  async saveAvailablePeriod(p: AvailablePeriod): Promise<void> {
    this.periods.set(p.id, clonePeriod(p));
  }

  async deleteAvailablePeriod(id: string): Promise<void> {
    this.periods.delete(id);
  }

  async listAvailablePeriodTags(): Promise<AvailablePeriodTag[]> {
    return [...this.tags.values()].map((t) => ({ ...t }));
  }

  async getAvailablePeriodTag(id: string): Promise<AvailablePeriodTag | null> {
    const t = this.tags.get(id);
    return t ? { ...t } : null;
  }

  async saveAvailablePeriodTag(t: AvailablePeriodTag): Promise<void> {
    this.tags.set(t.id, { ...t });
  }

  async deleteAvailablePeriodTag(id: string): Promise<void> {
    this.tags.delete(id);
  }
}

function clonePeriod(p: AvailablePeriod): AvailablePeriod {
  return { ...p, parentAreaIds: [...p.parentAreaIds], tagIds: [...p.tagIds] };
}
