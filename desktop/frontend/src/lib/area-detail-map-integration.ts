import type { PolygonID } from "map-polygon-editor";
import type { PlaceType } from "./map-renderer";
import type { AreaDetailViewModel } from "./area-detail-controller";

/**
 * MapView ハンドルの最小インタフェース (区域詳細編集モード用)。
 * 本物の MapViewHandle はより広いが、ここでは詳細編集で使うメソッドのみ要求する。
 */
export interface DetailMapHandleLike {
  setDetailMode(targetId: PolygonID, neighborIds: Set<string>): void;
  clearDetailMode(): void;
  renderAll(linkedPolygonIds?: Set<string>): void;
  setPlaces(
    places: ReadonlyArray<{
      id: string;
      lat: number;
      lng: number;
      type: PlaceType;
    }>,
  ): void;
  clearPlaces(): void;
  setMinZoom(zoom: number): void;
  clearMinZoom(): void;
  focusPolygon(id: PolygonID): void;
}

export interface PlaceWithType {
  id: string;
  lat: number;
  lng: number;
  type: PlaceType;
}

/**
 * ViewModel を MapView へ適用する純粋な副作用関数。
 * 呼び出し順: setDetailMode → renderAll (target/neighbor のみ描画) →
 * setPlaces → setMinZoom → focusPolygon。
 *
 * places は ViewModel.visiblePlaces の id 集合で絞り込み、種別を付与する。
 */
export function applyDetailViewModelToMap(
  handle: DetailMapHandleLike,
  vm: AreaDetailViewModel,
  allPlaces: ReadonlyArray<PlaceWithType>,
  linkedPolygonIds: Set<string>,
): void {
  const visibleIds = new Set(vm.visiblePlaces.map((p) => p.id));
  const places = allPlaces.filter((p) => visibleIds.has(p.id));

  handle.setDetailMode(vm.targetPolygonId as PolygonID, vm.neighborIds);
  handle.renderAll(linkedPolygonIds);
  handle.setPlaces(places);
  handle.setMinZoom(vm.minZoom);
  handle.focusPolygon(vm.targetPolygonId as PolygonID);
}

/**
 * 詳細編集モードを解除して通常表示に戻す。
 */
export function clearDetailViewModelFromMap(
  handle: DetailMapHandleLike,
  linkedPolygonIds: Set<string>,
): void {
  handle.clearPlaces();
  handle.clearMinZoom();
  handle.clearDetailMode();
  handle.renderAll(linkedPolygonIds);
}
