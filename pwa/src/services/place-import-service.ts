// AI 下書き場所の一時保持（stash）と、ポリゴン紐付け後の区域 Place 取込。
// docs/wants/03_地図機能.md Phase 1.1 / [論点-001]: 誤区域への大量生成を避けるため、
// 取込は「紐付け済み区域を選んでユーザーが明示的に実行」する。

import { newId } from "./id";
import { nextSortOrder } from "../lib/place-sort-order";
import type { PlaceService } from "./place-service";
import type { Place } from "./place-service";
import type { PlaceAssignment } from "../lib/assign-places-to-polygons";
import type { PendingImportPlace } from "../domain/models/pending-import-place";
import type { PendingImportPlaceRepository } from "../domain/repositories/pending-import-place-repository";

export class PlaceImportService {
  constructor(
    private readonly pendingRepo: PendingImportPlaceRepository,
    private readonly placeService: PlaceService,
    private readonly nowFn: () => Date = () => new Date(),
  ) {}

  /** AI 下書きの場所割り当てをポリゴン別に一時保持する。 */
  async stash(assignments: readonly PlaceAssignment[]): Promise<void> {
    if (assignments.length === 0) return;
    const pending: PendingImportPlace[] = assignments.map((a) => ({
      id: newId("pending-place"),
      polygonId: a.polygonId,
      coord: { lat: a.place.geo.lat, lng: a.place.geo.lng },
      number: a.place.number,
      label: a.place.label,
      address: a.place.address,
    }));
    await this.pendingRepo.saveMany(pending);
  }

  /** 指定ポリゴンの未確定場所件数。 */
  async pendingCount(polygonId: string): Promise<number> {
    return this.pendingRepo.countByPolygon(polygonId);
  }

  /**
   * 紐付け済み区域へ、指定ポリゴン群の未確定場所を戸建て Place として取り込む。
   * 場所番号順に sortOrder を既存最大+1 から連番で採番し、取込済み pending を消す。
   * @returns 作成した Place 件数
   */
  async importForArea(
    areaId: string,
    polygonIds: readonly string[],
  ): Promise<number> {
    const pendings: PendingImportPlace[] = [];
    for (const pid of polygonIds) {
      pendings.push(...(await this.pendingRepo.listByPolygon(pid)));
    }
    if (pendings.length === 0) return 0;

    // 地図に書かれた番号順に安定して並べる
    pendings.sort((a, b) => a.number - b.number);

    const existing = await this.placeService.listPlaces(areaId);
    let sortOrder = nextSortOrder(existing);
    const nowIso = this.nowFn().toISOString();

    for (const p of pendings) {
      const place: Place = {
        id: "",
        areaId,
        coord: p.coord,
        type: "house",
        label: p.label,
        displayName: "",
        address: p.address,
        description: "",
        parentId: "",
        sortOrder: sortOrder,
        languages: [],
        doNotVisit: false,
        doNotVisitNote: "",
        createdAt: nowIso,
        updatedAt: nowIso,
        deletedAt: null,
        restoredFromId: null,
      };
      await this.placeService.savePlace(place);
      sortOrder += 1;
    }

    for (const pid of polygonIds) {
      await this.pendingRepo.deleteByPolygon(pid);
    }
    return pendings.length;
  }
}
