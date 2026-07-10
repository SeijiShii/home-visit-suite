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
  /** high と判定する画像全体の最大実寸（対角・メートル）。広域すぎ＝誤ジオコーディング検出。省略時は既定。 */
  maxImageSpanMeters?: number;
  /** high と判定する最大異方性（幅/高さの比の大きい方）。退化（細い縦横）検出。省略時は既定。 */
  maxAnisotropy?: number;
}

/**
 * 既定閾値: 3 点以上かつ最大再投影誤差 15m 以内、かつ画像実寸が妥当なら high。
 * - 15m は小規模住宅ブロックの半分程度で、番号マーカーの取り違えが起きにくい目安。
 * - GCP がちょうど 3 点だとアフィン(6自由度)は必ず誤差 0 で完全フィットするため、
 *   残差だけでは誤り（同名地点への誤ジオコーディング・共線退化）を検出できない。
 *   画像実寸の妥当性（広域すぎ・異方性）で補完する。
 * - 50km: 徒歩訪問用の地図画像としては十分大きい上限。これを超える＝別地域へ誤マッチ。
 * - 20: 正しい地図なら幅/高さ比は数倍程度。極端な比は共線退化による細長ポリゴンの兆候。
 */
export const DEFAULT_CONFIDENCE_THRESHOLDS: ConfidenceThresholds = {
  minGcps: 3,
  maxErrorMeters: 15,
  maxImageSpanMeters: 50000,
  maxAnisotropy: 20,
};

/**
 * 変換後の画像全体（正規化座標 0..1 の単位正方形）の実寸を返す。
 * 幅=(0,0)-(1,0)、高さ=(0,0)-(0,1)、対角=(0,0)-(1,1) の地表メートル。
 */
function imageSpanMeters(t: AffineTransform): {
  width: number;
  height: number;
  diag: number;
} {
  const p00 = pixelToLatLng(t, { x: 0, y: 0 });
  const p10 = pixelToLatLng(t, { x: 1, y: 0 });
  const p01 = pixelToLatLng(t, { x: 0, y: 1 });
  const p11 = pixelToLatLng(t, { x: 1, y: 1 });
  return {
    width: haversineKm(p00, p10) * 1000,
    height: haversineKm(p00, p01) * 1000,
    diag: haversineKm(p00, p11) * 1000,
  };
}

/** ジオリファレンス結果を信頼度に分類する。 */
export function classifyConfidence(
  result: GeoreferenceResult,
  thresholds: ConfidenceThresholds = DEFAULT_CONFIDENCE_THRESHOLDS,
): ConfidenceLevel {
  if (
    result.gcpCount < thresholds.minGcps ||
    result.maxMeters > thresholds.maxErrorMeters
  ) {
    return "low";
  }
  // 画像実寸の妥当性: 広域すぎ（誤ジオコーディング）・退化（共線→細長）を弾く。
  const maxSpan =
    thresholds.maxImageSpanMeters ??
    DEFAULT_CONFIDENCE_THRESHOLDS.maxImageSpanMeters!;
  const maxAniso =
    thresholds.maxAnisotropy ?? DEFAULT_CONFIDENCE_THRESHOLDS.maxAnisotropy!;
  const span = imageSpanMeters(result.transform);
  const small = Math.max(Math.min(span.width, span.height), 1e-6);
  const anisotropy = Math.max(span.width, span.height) / small;
  if (span.diag > maxSpan) return "low";
  if (anisotropy > maxAniso) return "low";
  return "high";
}
