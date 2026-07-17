// PlaceRepository のインメモリ実装。
// LinkSelf TS アダプタが完成するまでの開発・テスト用。
// listPlaces は論理削除済み（deletedAt あり）を除外、deletePlace は deletedAt をセット、
// listDeletedPlacesNear は削除済みのうち指定座標から半径内のものを返す。

import type { Place } from "../../domain/models/place";
import type { PlaceRepository } from "../../domain/repositories/place-repository";
import { backedMap } from "../localstorage/persistent-map";

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

function clonePlace(p: Place): Place {
  return { ...p, coord: { ...p.coord }, languages: [...p.languages] };
}

export class InMemoryPlaceRepository implements PlaceRepository {
  private places: Map<string, Place>;

  constructor(
    private nowFn: () => Date = () => new Date(),
    storagePrefix?: string,
  ) {
    this.places = backedMap(storagePrefix, "places");
  }

  async listPlaces(areaId: string): Promise<Place[]> {
    return [...this.places.values()]
      .filter((p) => p.areaId === areaId && !p.deletedAt)
      .map(clonePlace);
  }

  async getPlace(id: string): Promise<Place | null> {
    const p = this.places.get(id);
    return p && !p.deletedAt ? clonePlace(p) : null;
  }

  async savePlace(place: Place): Promise<void> {
    this.places.set(place.id, clonePlace(place));
  }

  async deletePlace(id: string): Promise<void> {
    const p = this.places.get(id);
    if (p) {
      p.deletedAt = this.nowFn().toISOString();
    }
  }

  async listDeletedPlacesNear(
    lat: number,
    lng: number,
    radiusMeters: number,
  ): Promise<Place[]> {
    return [...this.places.values()]
      .filter((p) => !!p.deletedAt)
      .filter(
        (p) =>
          distanceMeters(lat, lng, p.coord.lat, p.coord.lng) <= radiusMeters,
      )
      .map(clonePlace);
  }

  async listDeletedRooms(buildingId: string): Promise<Place[]> {
    return [...this.places.values()]
      .filter(
        (p) => p.type === "room" && p.parentId === buildingId && !!p.deletedAt,
      )
      .map(clonePlace);
  }
}
