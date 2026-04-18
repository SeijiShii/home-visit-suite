export interface LatLng {
  lat: number;
  lng: number;
}

export interface PolygonCenter {
  id: string;
  center: LatLng;
}

const EARTH_RADIUS_KM = 6371;

export function polygonCenter(vertices: readonly LatLng[]): LatLng {
  if (vertices.length === 0) {
    throw new Error("polygonCenter: vertices must not be empty");
  }
  let lat = 0;
  let lng = 0;
  for (const v of vertices) {
    lat += v.lat;
    lng += v.lng;
  }
  return { lat: lat / vertices.length, lng: lng / vertices.length };
}

/**
 * 点がポリゴン内に含まれるか判定する (ray casting algorithm)。
 * `ring` は [lng, lat] の配列（GeoJSON の coordinates[0]）。
 * 閉じたリングでも開いたリングでも動作する。
 */
export function pointInRing(
  point: LatLng,
  ring: readonly [number, number][],
): boolean {
  let inside = false;
  const n = ring.length;
  if (n < 3) return false;
  // 閉じたリングの末尾 (= 始点) を除外
  const last = ring[n - 1];
  const first = ring[0];
  const count = last[0] === first[0] && last[1] === first[1] ? n - 1 : n;
  for (let i = 0, j = count - 1; i < count; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    const intersect =
      yi > point.lat !== yj > point.lat &&
      point.lng < ((xj - xi) * (point.lat - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

export function haversineKm(a: LatLng, b: LatLng): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(h));
}

export interface MinZoomParams {
  radiusKm: number;
  latitude: number;
  viewportPx: number;
}

/**
 * Web メルカトル: 1px ≈ 156543.03 * cos(lat) / 2^z メートル
 * 直径 2*radiusKm が viewportPx に収まる最小ズーム（floor で切り捨て）
 */
export function minZoomForRadius({
  radiusKm,
  latitude,
  viewportPx,
}: MinZoomParams): number {
  if (radiusKm <= 0) throw new Error("minZoomForRadius: radiusKm must be > 0");
  const diameterM = 2 * radiusKm * 1000;
  const metersPerPxAtZ0 = 156543.03 * Math.cos((latitude * Math.PI) / 180);
  // metersPerPx = metersPerPxAtZ0 / 2^z, want diameterM / viewportPx >= metersPerPx
  // → 2^z >= metersPerPxAtZ0 * viewportPx / diameterM
  const z = Math.log2((metersPerPxAtZ0 * viewportPx) / diameterM);
  return Math.floor(z);
}

export interface PlaceLike {
  id: string;
  lat: number;
  lng: number;
  deletedAt: string | null;
}

/**
 * 指定座標から radiusMeters 以内にある「論理削除済み」場所のうち最も近いものを返す。
 * 仕様 03_地図機能.md: 半径 5m 以内に削除済みの場所がある場合、訪問記録紐付け確認ダイアログを出す。
 */
export function findNearbyDeletedPlace(
  target: LatLng,
  places: readonly PlaceLike[],
  radiusMeters: number,
): PlaceLike | null {
  let best: PlaceLike | null = null;
  let bestDist = Infinity;
  for (const p of places) {
    if (!p.deletedAt) continue;
    const distM = haversineKm(target, { lat: p.lat, lng: p.lng }) * 1000;
    if (distM <= radiusMeters && distM < bestDist) {
      best = p;
      bestDist = distM;
    }
  }
  return best;
}

export interface AreaTreeLite {
  symbol: string;
  parentAreas: {
    number: string;
    areas: { id: string; number: string }[];
  }[];
}

export function formatAreaLabel(
  tree: readonly AreaTreeLite[],
  areaId: string,
): string | null {
  for (const region of tree) {
    for (const pa of region.parentAreas) {
      for (const area of pa.areas) {
        if (area.id === areaId) {
          return `${region.symbol}-${pa.number}-${area.number}`;
        }
      }
    }
  }
  return null;
}

export function findNeighborPolygons(
  target: PolygonCenter,
  all: readonly PolygonCenter[],
  radiusKm: number,
): PolygonCenter[] {
  return all.filter(
    (p) =>
      p.id !== target.id && haversineKm(target.center, p.center) <= radiusKm,
  );
}
