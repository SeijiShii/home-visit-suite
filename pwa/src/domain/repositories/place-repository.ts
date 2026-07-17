// 場所データの永続化インターフェース。
// 参照実装: shared/domain/place_repository.go

import type { Place } from "../models/place";

export interface PlaceRepository {
  listPlaces(areaId: string): Promise<Place[]>;
  getPlace(id: string): Promise<Place | null>;
  savePlace(place: Place): Promise<void>;
  /** 論理削除（deletedAt をセット）。 */
  deletePlace(id: string): Promise<void>;
  /** 指定座標から半径 radiusMeters メートル以内の削除済み場所を返す。 */
  listDeletedPlacesNear(
    lat: number,
    lng: number,
    radiusMeters: number,
  ): Promise<Place[]>;
  /** 指定 Building 配下の論理削除済み部屋を返す（部屋の同番号復元用）。 */
  listDeletedRooms(buildingId: string): Promise<Place[]>;
}
