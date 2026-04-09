import type { Polygon as GeoPolygon } from "geojson";
import {
  findNeighborPolygons,
  minZoomForRadius,
  polygonCenter,
  type LatLng,
  type PolygonCenter,
  type PlaceLike,
} from "./area-detail-geo";

/**
 * NetworkPolygonEditor から polygonId と GeoJSON を取り出すための最小インタフェース。
 * 本物の NetworkPolygonEditor はより広いが、ここでは純関数に必要な分のみ要求する。
 */
export interface PolygonGeoSource {
  getPolygons(): ReadonlyArray<{ id: string; active?: boolean }>;
  getPolygonGeoJSON(id: string): GeoPolygon | null;
}

/**
 * エディタから全ての活性ポリゴンの中心座標を計算する純関数。
 * GeoJSON の外周リング (coordinates[0]) の頂点を平均する。
 * 閉じたリングの終点は始点と重複するため除外する。
 */
export function polygonCentersFromEditor(
  editor: PolygonGeoSource,
): PolygonCenter[] {
  const centers: PolygonCenter[] = [];
  for (const p of editor.getPolygons()) {
    if (p.active === false) continue;
    const geo = editor.getPolygonGeoJSON(p.id);
    if (!geo || geo.coordinates.length === 0) continue;
    const ring = geo.coordinates[0];
    if (ring.length < 2) continue;
    // 閉じたリングの末尾 (= 始点) を除外
    const open = ring.slice(0, ring.length - 1);
    const vertices: LatLng[] = open.map(([lng, lat]) => ({ lat, lng }));
    if (vertices.length === 0) continue;
    centers.push({ id: p.id, center: polygonCenter(vertices) });
  }
  return centers;
}

export interface AreaDetailInputs {
  /** 全 (活性) ポリゴンの中心座標 */
  polygonCenters: readonly PolygonCenter[];
  /** polygonId → areaId */
  polygonToArea: ReadonlyMap<string, string>;
  /** 詳細編集対象の区域 ID */
  targetAreaId: string;
  /** 対象区域の場所一覧 (論理削除済みを含む) */
  places: readonly PlaceLike[];
  /** 設定値 `ui.areaDetailRadiusKm` (既定 5) */
  radiusKm: number;
  /** 地図ビューポートの短辺 (px) */
  viewportPx: number;
}

export interface VisiblePlace {
  id: string;
  lat: number;
  lng: number;
}

export interface AreaDetailViewModel {
  targetPolygonId: string;
  /** 対象区域ポリゴンの中心 (地図のパン先) */
  targetCenter: { lat: number; lng: number };
  neighborIds: Set<string>;
  visiblePlaces: VisiblePlace[];
  minZoom: number;
}

/**
 * 区域詳細編集モードの表示モデルを計算する純関数。
 * - 対象区域の polygonId を逆引き
 * - 中心から半径 N km 以内のポリゴンを neighbor とする
 * - 論理削除済み場所は非表示
 * - minZoom は半径 2N km がビューポートに収まる値 (floor)
 *
 * 対象 areaId に紐づくポリゴンが存在しない場合は null を返す。
 */
export function buildAreaDetailViewModel(
  inputs: AreaDetailInputs,
): AreaDetailViewModel | null {
  const {
    polygonCenters,
    polygonToArea,
    targetAreaId,
    places,
    radiusKm,
    viewportPx,
  } = inputs;

  // areaId → polygonId 逆引き
  let targetPolygonId: string | null = null;
  for (const [polyId, areaId] of polygonToArea) {
    if (areaId === targetAreaId) {
      targetPolygonId = polyId;
      break;
    }
  }
  if (!targetPolygonId) return null;

  const target = polygonCenters.find((p) => p.id === targetPolygonId);
  if (!target) return null;

  const neighbors = findNeighborPolygons(target, polygonCenters, radiusKm);
  const neighborIds = new Set(neighbors.map((n) => n.id));

  const visiblePlaces: VisiblePlace[] = places
    .filter((p) => !p.deletedAt)
    .map((p) => ({ id: p.id, lat: p.lat, lng: p.lng }));

  const minZoom = minZoomForRadius({
    radiusKm,
    latitude: target.center.lat,
    viewportPx,
  });

  return {
    targetPolygonId,
    targetCenter: target.center,
    neighborIds,
    visiblePlaces,
    minZoom,
  };
}
