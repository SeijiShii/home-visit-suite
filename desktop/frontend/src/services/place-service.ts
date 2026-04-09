import type { models } from "../../wailsjs/go/models";

// PlaceBinding API（Wails 自動生成の関数群に対応）
export interface PlaceBindingAPI {
  ListPlaces(areaID: string): Promise<models.Place[] | null>;
  GetPlace(id: string): Promise<models.Place | null>;
  SavePlace(place: models.Place): Promise<models.Place>;
  DeletePlace(id: string): Promise<void>;
  ListDeletedPlacesNear(
    lat: number,
    lng: number,
    radiusMeters: number,
  ): Promise<models.Place[] | null>;
}

export class PlaceService {
  constructor(private readonly api: PlaceBindingAPI) {}

  async listPlaces(areaID: string): Promise<models.Place[]> {
    return (await this.api.ListPlaces(areaID)) ?? [];
  }

  async getPlace(id: string): Promise<models.Place | null> {
    return await this.api.GetPlace(id);
  }

  async savePlace(place: models.Place): Promise<models.Place> {
    return await this.api.SavePlace(place);
  }

  async deletePlace(id: string): Promise<void> {
    await this.api.DeletePlace(id);
  }

  async listDeletedPlacesNear(
    lat: number,
    lng: number,
    radiusMeters: number,
  ): Promise<models.Place[]> {
    return (
      (await this.api.ListDeletedPlacesNear(lat, lng, radiusMeters)) ?? []
    );
  }
}
