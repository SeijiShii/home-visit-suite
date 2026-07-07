// PlaceBindingAPI（place-service が要求する抽象、旧 Wails PlaceBinding 相当）を
// PlaceRepository 上に実装する。SavePlace の id/timestamp 付与は Go binding
// （place.go）と同じ挙動にする。

import type { Place as DomainPlace } from "../domain/models/place";
import type { PlaceRepository } from "../domain/repositories/place-repository";
import type { Place, PlaceBindingAPI } from "./place-service";
import { newId } from "./id";

/**
 * place-service の Place 型と domain の Place 型は構造的に同一だが、
 * deletedAt / restoredFromId の null 許容の差を吸収するため明示変換する。
 */
function toServicePlace(p: DomainPlace): Place {
  return {
    ...p,
    deletedAt: p.deletedAt ?? null,
    restoredFromId: p.restoredFromId ?? null,
  };
}

function toDomainPlace(p: Place): DomainPlace {
  const d: DomainPlace = {
    id: p.id,
    areaId: p.areaId,
    coord: p.coord,
    type: p.type,
    label: p.label,
    displayName: p.displayName,
    address: p.address,
    description: p.description,
    parentId: p.parentId,
    sortOrder: p.sortOrder,
    languages: p.languages,
    doNotVisit: p.doNotVisit,
    doNotVisitNote: p.doNotVisitNote,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
  };
  if (p.deletedAt) d.deletedAt = p.deletedAt;
  if (p.restoredFromId) d.restoredFromId = p.restoredFromId;
  return d;
}

export class PlaceRepositoryBindingAdapter implements PlaceBindingAPI {
  constructor(
    private repo: PlaceRepository,
    private nowFn: () => Date = () => new Date(),
  ) {}

  async ListPlaces(areaId: string): Promise<Place[] | null> {
    const places = await this.repo.listPlaces(areaId);
    return places.map(toServicePlace);
  }

  async GetPlace(id: string): Promise<Place | null> {
    const p = await this.repo.getPlace(id);
    return p ? toServicePlace(p) : null;
  }

  async SavePlace(place: Place): Promise<Place> {
    const now = this.nowFn().toISOString();
    const next: Place = { ...place };
    if (next.id === "") {
      next.id = newId("place");
      next.createdAt = now;
    }
    next.updatedAt = now;
    await this.repo.savePlace(toDomainPlace(next));
    return next;
  }

  async DeletePlace(id: string): Promise<void> {
    await this.repo.deletePlace(id);
  }

  async ListDeletedPlacesNear(
    lat: number,
    lng: number,
    radiusMeters: number,
  ): Promise<Place[] | null> {
    const places = await this.repo.listDeletedPlacesNear(lat, lng, radiusMeters);
    return places.map(toServicePlace);
  }
}
