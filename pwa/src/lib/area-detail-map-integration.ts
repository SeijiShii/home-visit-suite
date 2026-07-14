import type { PolygonID } from "map-polygon-editor";
import type { PlaceType } from "./map-renderer";
import type { AreaDetailViewModel } from "./area-detail-controller";

/**
 * MapView ハンドルの最小インタフェース (区域詳細編集モード用)。
 * 本物の MapViewHandle はより広いが、ここでは詳細編集で使うメソッドのみ要求する。
 */
export interface DetailMapHandleLike {
  setDetailMode(
    targetIds: readonly PolygonID[],
    neighborIds: Set<string>,
  ): void;
  clearDetailMode(): void;
  renderAll(linkedPolygonIds?: Set<string>): void;
  setPlaces(
    places: ReadonlyArray<{
      id: string;
      lat: number;
      lng: number;
      type: PlaceType;
      tooltip?: string;
      index?: number;
      selected?: boolean;
    }>,
  ): void;
  clearPlaces(): void;
  setMinZoom(zoom: number): void;
  clearMinZoom(): void;
  /** 指定ポリゴン群（飛地含む）が全て収まる範囲へフォーカスする。 */
  focusPolygons(ids: readonly PolygonID[]): void;
}

export interface PlaceWithType {
  id: string;
  lat: number;
  lng: number;
  type: PlaceType;
  /** ツールチップ文字列 (未指定ならバインドしない) */
  tooltip?: string;
  /** 通し番号バッジ用 index (0 始まり)。未指定ならバッジ無し。 */
  index?: number;
  /** 選択中なら true。マーカーを強調表示する。 */
  selected?: boolean;
}

/**
 * ViewModel を MapView へ適用する純粋な副作用関数。
 * 呼び出し順: setDetailMode → renderAll (target/neighbor のみ描画) →
 * setPlaces → setMinZoom → focusPolygon。
 *
 * places は ViewModel.visiblePlaces の id 集合で絞り込み、種別を付与する。
 *
 * skipFocus=true のとき focusPolygon を呼ばない (編集後の再適用で
 * 現在のビューを維持するため)。
 */
export function applyDetailViewModelToMap(
  handle: DetailMapHandleLike,
  vm: AreaDetailViewModel,
  allPlaces: ReadonlyArray<PlaceWithType>,
  linkedPolygonIds: Set<string>,
  skipFocus = false,
): void {
  const visibleIds = new Set(vm.visiblePlaces.map((p) => p.id));
  const places = allPlaces.filter((p) => visibleIds.has(p.id));

  handle.setDetailMode(vm.targetPolygonIds as PolygonID[], vm.neighborIds);
  handle.renderAll(linkedPolygonIds);
  handle.setPlaces(places);
  handle.setMinZoom(vm.minZoom);
  if (!skipFocus) {
    // 飛地含め全対象ポリゴンが収まる範囲へフォーカスする
    handle.focusPolygons(vm.targetPolygonIds as PolygonID[]);
  }
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
