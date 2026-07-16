// CoverageRepository の LinkSelf(MyDB SQL) 実装。
// 網羅記録を JSON 行テーブル（coverages）に保存する。
// ネットワーク配線時は ScopeNetwork で全メンバーへ伝播する（docs/wants/01「同期スコープ」）。

import type { MyDB } from "@linkself/core";
import type { Coverage } from "../../domain/models/coverage";
import type { CoverageRepository } from "../../domain/repositories/coverage-repository";
import { deleteRow, getRow, listRows, putRow } from "./group-schema";

export class LinkSelfCoverageRepository implements CoverageRepository {
  constructor(private readonly db: MyDB) {}

  async listCoverages(parentAreaId: string): Promise<Coverage[]> {
    return (await listRows<Coverage>(this.db, "coverages")).filter(
      (c) => c.parentAreaId === parentAreaId,
    );
  }

  getCoverage(id: string): Promise<Coverage | null> {
    return getRow<Coverage>(this.db, "coverages", id);
  }

  saveCoverage(c: Coverage): Promise<void> {
    return putRow(this.db, "coverages", c.id, c);
  }

  deleteCoverage(id: string): Promise<void> {
    return deleteRow(this.db, "coverages", id);
  }
}
