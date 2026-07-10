// PendingImportPlaceRepository のインメモリ実装。
// LinkSelf TS アダプタ完成までの開発・テスト用。

import type { PendingImportPlace } from "../../domain/models/pending-import-place";
import type { PendingImportPlaceRepository } from "../../domain/repositories/pending-import-place-repository";
import { backedMap } from "../localstorage/persistent-map";

export class InMemoryPendingImportPlaceRepository implements PendingImportPlaceRepository {
  private byId: Map<string, PendingImportPlace>;

  constructor(storagePrefix?: string) {
    this.byId = backedMap(storagePrefix, "byId");
  }

  async saveMany(places: readonly PendingImportPlace[]): Promise<void> {
    for (const p of places) this.byId.set(p.id, { ...p });
  }

  async listByPolygon(polygonId: string): Promise<PendingImportPlace[]> {
    return [...this.byId.values()]
      .filter((p) => p.polygonId === polygonId)
      .map((p) => ({ ...p }));
  }

  async countByPolygon(polygonId: string): Promise<number> {
    let n = 0;
    for (const p of this.byId.values()) if (p.polygonId === polygonId) n += 1;
    return n;
  }

  async deleteByPolygon(polygonId: string): Promise<void> {
    for (const [id, p] of this.byId) {
      if (p.polygonId === polygonId) this.byId.delete(id);
    }
  }
}
