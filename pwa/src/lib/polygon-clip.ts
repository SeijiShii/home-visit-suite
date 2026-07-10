// 隣接ポリゴンの境界共有のためのジオメトリ処理。
// docs/wants/03_地図機能.md §信頼度による分岐 / 隣接エリアの境界共有。
//
// 方針（既存優先・新規は外側）:
//   1. スナップ: 新ポリゴンの各頂点が、既存ポリゴンの頂点/エッジに許容距離内で
//      近ければそこへ吸着させる（「とても近いが隙間がある」境界を密着させる）。
//   2. 差集合: 新ポリゴン − 既存ポリゴンの和 を計算し、重なりを除去して外側だけ残す
//      （交差による細かいポリゴンの乱立を防ぎ、境界線を既存に沿わせる）。
// 頂点ノードの共有（ネットワーク統合）は行わず、座標上の一致に留める。

// polygon-clipping は CommonJS（module.exports = {difference, ...}、default 無し）。
// Vite の ESM 相互運用では名前付き import が失敗するため、esModuleInterop による
// デフォルト import で module.exports 全体（関数群を持つオブジェクト）を取得する。
import polygonClipping from "polygon-clipping";
import type { Ring as ClipRing } from "polygon-clipping";
import { haversineKm, type LatLng } from "./area-detail-geo";

export interface ClipOptions {
  /** 既存の頂点/エッジへスナップする許容距離（メートル）。 */
  snapMeters?: number;
  /** 差集合の結果、この面積(m²)未満の破片は捨てる（細かいポリゴン抑制）。 */
  minAreaM2?: number;
}

const DEFAULT_SNAP_METERS = 5;
const DEFAULT_MIN_AREA_M2 = 5;

function metersBetween(a: LatLng, b: LatLng): number {
  return haversineKm(a, b) * 1000;
}

/** 点 p から線分 a-b への最近点（局所的な等距離近似）。 */
function nearestOnSegment(p: LatLng, a: LatLng, b: LatLng): LatLng {
  const cosLat = Math.max(Math.cos((p.lat * Math.PI) / 180), 1e-6);
  const px = p.lng * cosLat;
  const py = p.lat;
  const ax = a.lng * cosLat;
  const ay = a.lat;
  const bx = b.lng * cosLat;
  const by = b.lat;
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  if (len2 < 1e-18) return { lat: a.lat, lng: a.lng };
  let t = ((px - ax) * dx + (py - ay) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  const nx = ax + t * dx;
  const ny = ay + t * dy;
  return { lat: ny, lng: nx / cosLat };
}

/** 1 頂点を、許容距離内で最も近い既存の頂点（優先）またはエッジ点へスナップする。 */
function snapVertex(
  v: LatLng,
  existingRings: readonly LatLng[][],
  tolM: number,
): LatLng {
  let best: LatLng | null = null;
  let bestDist = tolM;
  let bestIsVertex = false;

  for (const ring of existingRings) {
    // 頂点（優先: 同距離なら頂点を選ぶ）
    for (const u of ring) {
      const d = metersBetween(v, u);
      if (d < bestDist || (d <= bestDist && !bestIsVertex)) {
        bestDist = d;
        best = u;
        bestIsVertex = true;
      }
    }
  }
  // 頂点に吸着できなければエッジ点を探す
  if (!best) {
    for (const ring of existingRings) {
      for (let i = 0; i < ring.length; i++) {
        const a = ring[i];
        const b = ring[(i + 1) % ring.length];
        const q = nearestOnSegment(v, a, b);
        const d = metersBetween(v, q);
        if (d < bestDist) {
          bestDist = d;
          best = q;
        }
      }
    }
  }
  return best ?? v;
}

/** リング全頂点を既存へスナップする。 */
function snapRing(
  ring: readonly LatLng[],
  existingRings: readonly LatLng[][],
  tolM: number,
): LatLng[] {
  return ring.map((v) => snapVertex(v, existingRings, tolM));
}

function toClipRing(ring: readonly LatLng[]): ClipRing {
  const r: ClipRing = ring.map((p) => [p.lng, p.lat]);
  // polygon-clipping はリングを閉じる想定。先頭と末尾を一致させる。
  if (r.length > 0) {
    const [fx, fy] = r[0];
    const [lx, ly] = r[r.length - 1];
    if (fx !== lx || fy !== ly) r.push([fx, fy]);
  }
  return r;
}

function fromClipRing(r: ClipRing): LatLng[] {
  const out: LatLng[] = r.map(([lng, lat]) => ({ lat, lng }));
  // 末尾の閉じ頂点は取り除く（呼び出し側の cleanRing でも落ちるが明示的に）。
  if (out.length >= 2) {
    const f = out[0];
    const l = out[out.length - 1];
    if (f.lat === l.lat && f.lng === l.lng) out.pop();
  }
  return out;
}

/** リング面積（m²）。局所等距離近似のシューレース。 */
function ringAreaM2(ring: readonly LatLng[]): number {
  if (ring.length < 3) return 0;
  const lat0 = ring[0].lat;
  const cosLat = Math.max(Math.cos((lat0 * Math.PI) / 180), 1e-6);
  const mPerDeg = 111320;
  let a = 0;
  for (let i = 0; i < ring.length; i++) {
    const p = ring[i];
    const q = ring[(i + 1) % ring.length];
    const px = p.lng * cosLat * mPerDeg;
    const py = p.lat * mPerDeg;
    const qx = q.lng * cosLat * mPerDeg;
    const qy = q.lat * mPerDeg;
    a += px * qy - qx * py;
  }
  return Math.abs(a) / 2;
}

/**
 * 新ポリゴンを既存へスナップし、既存との重なりを差集合で除去して外側リング群を返す。
 * 既存が無ければスナップ不要でそのまま返す。結果の穴（内側リング）は無視する
 * （隣接ユースでは稀）。極小破片は minAreaM2 未満で捨てる。
 */
interface BBox {
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
}

function bboxOf(ring: readonly LatLng[]): BBox {
  let minLat = Infinity,
    maxLat = -Infinity,
    minLng = Infinity,
    maxLng = -Infinity;
  for (const p of ring) {
    if (p.lat < minLat) minLat = p.lat;
    if (p.lat > maxLat) maxLat = p.lat;
    if (p.lng < minLng) minLng = p.lng;
    if (p.lng > maxLng) maxLng = p.lng;
  }
  return { minLat, maxLat, minLng, maxLng };
}

function bboxOverlap(a: BBox, b: BBox, marginDeg = 0): boolean {
  return (
    a.minLat - marginDeg <= b.maxLat &&
    a.maxLat + marginDeg >= b.minLat &&
    a.minLng - marginDeg <= b.maxLng &&
    a.maxLng + marginDeg >= b.minLng
  );
}

export function alignAndClipPolygon(
  newRing: readonly LatLng[],
  existingRings: readonly LatLng[][],
  opts: ClipOptions = {},
): LatLng[][] {
  const asIs = (): LatLng[][] => [newRing.map((p) => ({ ...p }))];
  if (existingRings.length === 0) return asIs();

  const tolM = opts.snapMeters ?? DEFAULT_SNAP_METERS;
  const minArea = opts.minAreaM2 ?? DEFAULT_MIN_AREA_M2;
  const marginDeg = tolM / 111320; // スナップ許容距離を緯度差に概算

  // 新ポリゴンの近傍にある既存だけを対象にする（遠方の既存に対して差集合を
  // 走らせない）。vision の自己交差を含む境界を disjoint な既存で消してしまう
  // 事故を防ぐ。近傍が無ければそのまま採用する。
  const nb = bboxOf(newRing);
  const nearby = existingRings.filter((r) =>
    bboxOverlap(bboxOf(r), nb, marginDeg),
  );
  if (nearby.length === 0) return asIs();

  const snapped = snapRing(newRing, nearby, tolM);

  // 実際に bbox が重なる既存のみクリップ対象にする（近接だけならスナップで十分で、
  // 差集合は不要 = 隣接ポリゴンはそのまま残す）。
  const sb = bboxOf(snapped);
  const clippers = nearby.filter((r) => bboxOverlap(bboxOf(r), sb));
  if (clippers.length === 0) return [snapped];

  const subject = [toClipRing(snapped)];
  const clips = clippers.map((r) => [toClipRing(r)]);

  // まず実際の重なり（交差面積）を測る。ほぼ重なっていなければ差集合は通さず
  // スナップ済みをそのまま採用する（vision の自己交差境界を、隣接するだけの
  // 既存で誤って消してしまう事故を防ぐ）。
  let interArea = 0;
  try {
    const inter = polygonClipping.intersection(subject, ...clips);
    for (const polygon of inter) {
      if (polygon[0]) interArea += ringAreaM2(fromClipRing(polygon[0]));
    }
  } catch {
    return [snapped];
  }
  if (interArea < minArea) return [snapped];

  // 実際に重なる → 差集合で外側だけ残す（完全内包なら空 = 既存優先でドロップ）。
  let result;
  try {
    result = polygonClipping.difference(subject, ...clips);
  } catch {
    return [snapped];
  }

  const rings: LatLng[][] = [];
  for (const polygon of result) {
    const outer = polygon[0];
    if (!outer) continue;
    const ring = fromClipRing(outer);
    if (ring.length >= 3 && ringAreaM2(ring) >= minArea) rings.push(ring);
  }
  return rings;
}
