// 自動ジオリファレンス: AI が抽出したランドマークの「画像内ピクセル位置」と
// GSI ジオコーディングで得た「実座標」の対応点（GCP）から、
// 画素 → 緯度経度のアフィン変換を最小二乗で推定する。
// docs/wants/03_地図機能.md「AI による区域地図作成」§自動ジオリファレンス。
//
// 変換は Web メルカトル（EPSG:3857）メートル空間で線形推定し、
// 残差は haversine による地表メートルで評価する（信頼度スコアの根拠）。

import { haversineKm, type LatLng } from "./area-detail-geo";

/** 画像内ピクセル座標（原点は左上、y は下向き）。 */
export interface Pixel {
  x: number;
  y: number;
}

/** 対応点（Ground Control Point）: 画素位置 ↔ 実座標。 */
export interface Gcp {
  pixel: Pixel;
  geo: LatLng;
}

/**
 * 画素 → Web メルカトルメートルのアフィン変換。
 *   mercX = a*px + b*py + c
 *   mercY = d*px + e*py + f
 */
export interface AffineTransform {
  a: number;
  b: number;
  c: number;
  d: number;
  e: number;
  f: number;
}

export interface GeoreferenceResult {
  transform: AffineTransform;
  /** 全 GCP の再投影誤差の二乗平均平方根（地表メートル）。 */
  rmsMeters: number;
  /** 最大の再投影誤差（地表メートル）。外れ値検出に使う。 */
  maxMeters: number;
  gcpCount: number;
}

const EARTH_RADIUS_M = 6378137;
const MAX_LAT = 85.05112878; // Web メルカトルの緯度上限

const toRad = (deg: number) => (deg * Math.PI) / 180;
const toDeg = (rad: number) => (rad * 180) / Math.PI;

/** 緯度経度 → Web メルカトルメートル。 */
export function latLngToMercator(ll: LatLng): { x: number; y: number } {
  const lat = Math.max(Math.min(ll.lat, MAX_LAT), -MAX_LAT);
  return {
    x: EARTH_RADIUS_M * toRad(ll.lng),
    y: EARTH_RADIUS_M * Math.log(Math.tan(Math.PI / 4 + toRad(lat) / 2)),
  };
}

/** Web メルカトルメートル → 緯度経度。 */
export function mercatorToLatLng(m: { x: number; y: number }): LatLng {
  return {
    lng: toDeg(m.x / EARTH_RADIUS_M),
    lat: toDeg(2 * Math.atan(Math.exp(m.y / EARTH_RADIUS_M)) - Math.PI / 2),
  };
}

/** アフィン変換を画素へ適用し緯度経度を返す。 */
export function pixelToLatLng(t: AffineTransform, p: Pixel): LatLng {
  const x = t.a * p.x + t.b * p.y + t.c;
  const y = t.d * p.x + t.e * p.y + t.f;
  return mercatorToLatLng({ x, y });
}

/**
 * 3x3 の対称正定値系 A·θ = rhs をガウス消去（部分ピボット）で解く。
 * ピボットが極小なら退化（共線 GCP 等）とみなし null を返す。
 */
function solve3x3(A: number[][], rhs: number[]): number[] | null {
  // 拡大係数行列（破壊的に操作するためコピー）
  const m = A.map((row, i) => [...row, rhs[i]]);
  const n = 3;
  for (let col = 0; col < n; col++) {
    // 部分ピボット選択
    let pivot = col;
    for (let r = col + 1; r < n; r++) {
      if (Math.abs(m[r][col]) > Math.abs(m[pivot][col])) pivot = r;
    }
    if (Math.abs(m[pivot][col]) < 1e-9) return null;
    [m[col], m[pivot]] = [m[pivot], m[col]];
    // 前進消去
    for (let r = col + 1; r < n; r++) {
      const factor = m[r][col] / m[col][col];
      for (let c = col; c <= n; c++) m[r][c] -= factor * m[col][c];
    }
  }
  // 後退代入
  const x = [0, 0, 0];
  for (let r = n - 1; r >= 0; r--) {
    let sum = m[r][n];
    for (let c = r + 1; c < n; c++) sum -= m[r][c] * x[c];
    x[r] = sum / m[r][r];
  }
  return x;
}

/**
 * GCP からアフィン変換を最小二乗推定する。
 * @throws GCP が 3 点未満、または退化（共線）で解けない場合。
 */
export function solveGeoreference(gcps: readonly Gcp[]): GeoreferenceResult {
  if (gcps.length < 3) {
    throw new Error("solveGeoreference: 対応点が 3 点必要です");
  }

  // 設計行列 M の行 = [px, py, 1]。x 用・y 用で同一の正規方程式 MᵀM を共有し、
  // 右辺 Mᵀ·mercX / Mᵀ·mercY だけ替えて 2 回解く。
  const MtM = [
    [0, 0, 0],
    [0, 0, 0],
    [0, 0, 0],
  ];
  const btx = [0, 0, 0];
  const bty = [0, 0, 0];
  for (const g of gcps) {
    const row = [g.pixel.x, g.pixel.y, 1];
    const m = latLngToMercator(g.geo);
    for (let i = 0; i < 3; i++) {
      for (let j = 0; j < 3; j++) MtM[i][j] += row[i] * row[j];
      btx[i] += row[i] * m.x;
      bty[i] += row[i] * m.y;
    }
  }

  const cx = solve3x3(MtM, btx);
  const cy = solve3x3(MtM, bty);
  if (!cx || !cy) {
    throw new Error("solveGeoreference: 対応点が退化しています（共線など）");
  }

  const transform: AffineTransform = {
    a: cx[0],
    b: cx[1],
    c: cx[2],
    d: cy[0],
    e: cy[1],
    f: cy[2],
  };

  // 残差（地表メートル）を評価する。
  let sumSq = 0;
  let maxMeters = 0;
  for (const g of gcps) {
    const reproj = pixelToLatLng(transform, g.pixel);
    const meters = haversineKm(reproj, g.geo) * 1000;
    sumSq += meters * meters;
    if (meters > maxMeters) maxMeters = meters;
  }
  const rmsMeters = Math.sqrt(sumSq / gcps.length);

  return { transform, rmsMeters, maxMeters, gcpCount: gcps.length };
}

/** ジオリファレンス信頼度。high = 自動配置、low = 手動オーバーレイ整列へ誘導。 */
export type ConfidenceLevel = "high" | "low";

export interface ConfidenceThresholds {
  /** high と判定する最小 GCP 数。 */
  minGcps: number;
  /** high と判定する最大再投影誤差（地表メートル）。 */
  maxErrorMeters: number;
}

/**
 * 既定閾値: 3 点以上かつ最大再投影誤差 15m 以内なら high。
 * 15m は小規模住宅ブロックの半分程度で、番号マーカーの取り違えが起きにくい目安。
 */
export const DEFAULT_CONFIDENCE_THRESHOLDS: ConfidenceThresholds = {
  minGcps: 3,
  maxErrorMeters: 15,
};

/** ジオリファレンス結果を信頼度に分類する。 */
export function classifyConfidence(
  result: GeoreferenceResult,
  thresholds: ConfidenceThresholds = DEFAULT_CONFIDENCE_THRESHOLDS,
): ConfidenceLevel {
  return result.gcpCount >= thresholds.minGcps &&
    result.maxMeters <= thresholds.maxErrorMeters
    ? "high"
    : "low";
}
