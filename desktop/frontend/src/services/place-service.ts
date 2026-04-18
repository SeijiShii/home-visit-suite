/**
 * Place 型の局所定義。
 * Phase 3 で Go 側に PlaceBinding を追加したが wails generate が未実行のため、
 * ここで shared/domain/models/place.go と一致するインタフェースを定義する。
 * wails generate 後は models.Place への切替を検討する。
 */
export type PlaceType = "house" | "building" | "room";

export interface Coordinate {
  lat: number;
  lng: number;
}

export interface Place {
  id: string;
  areaId: string;
  coord: Coordinate;
  type: PlaceType;
  label: string;
  displayName: string;
  address: string;
  parentId: string;
  sortOrder: number;
  languages: string[];
  doNotVisit: boolean;
  doNotVisitNote: string;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string | null;
  restoredFromId?: string | null;
}

// PlaceBinding API（Wails 自動生成の関数群に対応する型）
export interface PlaceBindingAPI {
  ListPlaces(areaID: string): Promise<Place[] | null>;
  GetPlace(id: string): Promise<Place | null>;
  SavePlace(place: Place): Promise<Place>;
  DeletePlace(id: string): Promise<void>;
  ListDeletedPlacesNear(
    lat: number,
    lng: number,
    radiusMeters: number,
  ): Promise<Place[] | null>;
}

export class PlaceService {
  constructor(private readonly api: PlaceBindingAPI) {}

  async listPlaces(areaID: string): Promise<Place[]> {
    return (await this.api.ListPlaces(areaID)) ?? [];
  }

  async getPlace(id: string): Promise<Place | null> {
    return await this.api.GetPlace(id);
  }

  async savePlace(place: Place): Promise<Place> {
    return await this.api.SavePlace(place);
  }

  async deletePlace(id: string): Promise<void> {
    await this.api.DeletePlace(id);
  }

  async listDeletedPlacesNear(
    lat: number,
    lng: number,
    radiusMeters: number,
  ): Promise<Place[]> {
    return (await this.api.ListDeletedPlacesNear(lat, lng, radiusMeters)) ?? [];
  }
}
