import type { Polygon as GeoPolygon } from "geojson";
import {
  haversineKm,
  minZoomForRadius,
  polygonCenter,
  unionBounds,
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
    const lats = vertices.map((v) => v.lat);
    const lngs = vertices.map((v) => v.lng);
    centers.push({
      id: p.id,
      center: polygonCenter(vertices),
      bounds: {
        minLat: Math.min(...lats),
        maxLat: Math.max(...lats),
        minLng: Math.min(...lngs),
        maxLng: Math.max(...lngs),
      },
    });
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
  /** 対象区域に紐づく全ポリゴン（飛地対応で複数可） */
  targetPolygonIds: string[];
  /** 対象区域の中心 = 全飛地の外接範囲（バウンディングボックス）の中心 */
  targetCenter: { lat: number; lng: number };
  neighborIds: Set<string>;
  visiblePlaces: VisiblePlace[];
  minZoom: number;
}

/**
 * 区域詳細編集モードの表示モデルを計算する純関数。
 * - 対象区域の polygonId 群（飛地含む）を逆引き
 * - 中心（全飛地の外接範囲の中心）から半径 N km 以内のポリゴンを neighbor とする
 *   （対象飛地自身は neighbor に含めない）
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

  // areaId → polygonId 群の逆引き（飛地対応）
  const targetIdSet = new Set<string>();
  for (const [polyId, areaId] of polygonToArea) {
    if (areaId === targetAreaId) targetIdSet.add(polyId);
  }
  const targets = polygonCenters.filter((p) => targetIdSet.has(p.id));
  if (targets.length === 0) return null;

  // 中心 = 全飛地の外接範囲の中心（bounds 未算出のポリゴンは中心点で代用）
  const bbox = unionBounds(
    targets.map(
      (p) =>
        p.bounds ?? {
          minLat: p.center.lat,
          maxLat: p.center.lat,
          minLng: p.center.lng,
          maxLng: p.center.lng,
        },
    ),
  )!;
  const targetCenter: LatLng = {
    lat: (bbox.minLat + bbox.maxLat) / 2,
    lng: (bbox.minLng + bbox.maxLng) / 2,
  };

  const neighborIds = new Set(
    polygonCenters
      .filter(
        (p) =>
          !targetIdSet.has(p.id) &&
          haversineKm(targetCenter, p.center) <= radiusKm,
      )
      .map((p) => p.id),
  );

  const visiblePlaces: VisiblePlace[] = places
    .filter((p) => !p.deletedAt)
    .map((p) => ({ id: p.id, lat: p.lat, lng: p.lng }));

  const minZoom = minZoomForRadius({
    radiusKm,
    latitude: targetCenter.lat,
    viewportPx,
  });

  return {
    targetPolygonIds: targets.map((p) => p.id),
    targetCenter,
    neighborIds,
    visiblePlaces,
    minZoom,
  };
}
