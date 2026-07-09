// AI 下書きの場所を、それを内包する取込ポリゴンへ割り当てる純関数。
// 取込ポリゴンは生成時点で区域未紐付けのため、場所は「どのポリゴンの中か」でだけ束ねておき、
// ポリゴンが区域へ紐付いた後に区域の Place として取り込む（docs/wants/03 Phase 1.1）。

import { pointInRing } from "./area-detail-geo";
import type { DraftPlace } from "../services/ai-map-import";

/** ポリゴン ID と外周リング（[lng, lat] の配列、GeoJSON coordinates[0] 相当）。 */
export interface PolygonRing {
  id: string;
  ring: [number, number][];
}

export interface PlaceAssignment {
  polygonId: string;
  place: DraftPlace;
}

/**
 * 各場所を、最初に内包したポリゴンへ割り当てる。
 * どのポリゴンにも含まれない場所はスキップする。
 */
export function assignPlacesToPolygons(
  polygons: readonly PolygonRing[],
  places: readonly DraftPlace[],
): PlaceAssignment[] {
  const out: PlaceAssignment[] = [];
  for (const place of places) {
    const owner = polygons.find((p) => pointInRing(place.geo, p.ring));
    if (owner) out.push({ polygonId: owner.id, place });
  }
  return out;
}
