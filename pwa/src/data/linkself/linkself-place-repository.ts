// PlaceRepository の LinkSelf(MyDB SQL) 実装。
// 場所（住宅情報）を JSON 行テーブル（places）に保存する。
// ネットワーク配線時は ScopeNetwork で全メンバーへ伝播する（docs/wants/01「同期スコープ」）。
// listPlaces は論理削除済み（deletedAt あり）を除外、deletePlace は deletedAt をセット、
// listDeletedPlacesNear は削除済みのうち指定座標から半径内のものを返す
// （InMemoryPlaceRepository と同じ規約）。

import type { MyDB } from "@linkself/core";
import type { Place } from "../../domain/models/place";
import type { PlaceRepository } from "../../domain/repositories/place-repository";
import { getRow, listRows, putRow } from "./group-schema";

/** Haversine 距離（メートル）。 */
function distanceMeters(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const R = 6371000; // 地球半径(m)
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
}

export class LinkSelfPlaceRepository implements PlaceRepository {
  constructor(
    private readonly db: MyDB,
    private readonly nowFn: () => Date = () => new Date(),
  ) {}

  async listPlaces(areaId: string): Promise<Place[]> {
    return (await listRows<Place>(this.db, "places")).filter(
      (p) => p.areaId === areaId && !p.deletedAt,
    );
  }

  async getPlace(id: string): Promise<Place | null> {
    const p = await getRow<Place>(this.db, "places", id);
    return p && !p.deletedAt ? p : null;
  }

  savePlace(place: Place): Promise<void> {
    return putRow(this.db, "places", place.id, place);
  }

  async deletePlace(id: string): Promise<void> {
    const p = await getRow<Place>(this.db, "places", id);
    if (p) {
      p.deletedAt = this.nowFn().toISOString();
      await putRow(this.db, "places", id, p);
    }
  }

  async listDeletedPlacesNear(
    lat: number,
    lng: number,
    radiusMeters: number,
  ): Promise<Place[]> {
    return (await listRows<Place>(this.db, "places"))
      .filter((p) => !!p.deletedAt)
      .filter(
        (p) =>
          distanceMeters(lat, lng, p.coord.lat, p.coord.lng) <= radiusMeters,
      );
  }
}
