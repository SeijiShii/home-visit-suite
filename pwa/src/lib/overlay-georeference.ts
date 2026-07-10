// 手動オーバーレイ整列（Phase 1.2、低信頼フォールバック）の座標変換。
// ユーザーがアップロード画像を実地図に軸平行オーバーレイして位置合わせした結果
// （配置した LatLngBounds）から、画像内の相対座標 → 緯度経度を線形写像する。
// docs/wants/03_地図機能.md §信頼度による分岐 / Phase 1.2。
//
// vision は座標を「画像の幅/高さに対する 0.0〜1.0 の比率」で返す（実解像度非依存）。
// そのため画像のピクセルサイズは不要で、比率をそのまま bounds に写像すればよい。

import type { LatLng } from "./area-detail-geo";
import type { DraftPolygon, VisionBoundary } from "../services/ai-map-import";
import type { Pixel } from "./georeference";

/** 画像の自然（ピクセル）サイズ。オーバーレイの初期アスペクト比算出に使う。 */
export interface ImageSize {
  width: number;
  height: number;
}

/** オーバーレイを嵌め込んだ軸平行の地理境界。 */
export interface OverlayBounds {
  north: number;
  south: number;
  east: number;
  west: number;
}

/**
 * 画像内の相対座標（x,y は 0.0〜1.0）→ 緯度経度。
 * (0,0)=左上 が北西角、(1,1)=右下 が南東角。
 * rotationDeg を与えると bounds 中心まわりに時計回りへ回転させる（CSS rotate と同符号）。
 */
export function overlayFractionToLatLng(
  bounds: OverlayBounds,
  frac: Pixel,
  rotationDeg = 0,
): LatLng {
  const p = {
    lng: bounds.west + frac.x * (bounds.east - bounds.west),
    lat: bounds.north - frac.y * (bounds.north - bounds.south),
  };
  if (rotationDeg === 0) return p;

  // 中心まわりの回転。緯度により経度が圧縮されるため、局所の等距離枠
  // （東成分 = Δlng·cos(lat)、北成分 = Δlat）で回転させてから戻す。
  const cLat = (bounds.north + bounds.south) / 2;
  const cLng = (bounds.west + bounds.east) / 2;
  const cosLat = Math.max(Math.cos((cLat * Math.PI) / 180), 1e-6);
  const dx = (p.lng - cLng) * cosLat;
  const dy = p.lat - cLat;
  const th = (rotationDeg * Math.PI) / 180;
  const cos = Math.cos(th);
  const sin = Math.sin(th);
  // 時計回り（画面 y 下向きでの CSS rotate と一致）
  const dx2 = dx * cos + dy * sin;
  const dy2 = -dx * sin + dy * cos;
  return { lng: cLng + dx2 / cosLat, lat: cLat + dy2 };
}

/** 相対座標(0〜1)の境界線群を、オーバーレイ配置に基づき緯度経度ポリゴンへ変換する。 */
export function overlayBoundariesToPolygons(
  bounds: OverlayBounds,
  boundaries: readonly VisionBoundary[],
  rotationDeg = 0,
): DraftPolygon[] {
  return boundaries.map((b) => ({
    vertices: b.vertices.map((v) =>
      overlayFractionToLatLng(bounds, v, rotationDeg),
    ),
  }));
}

/** 比率座標リングの面積（0..1 空間のシューレース、符号なし）。 */
function fractionRingArea(
  vertices: readonly { x: number; y: number }[],
): number {
  if (vertices.length < 3) return 0;
  let a = 0;
  for (let i = 0; i < vertices.length; i++) {
    const p = vertices[i];
    const q = vertices[(i + 1) % vertices.length];
    a += p.x * q.y - q.x * p.y;
  }
  return Math.abs(a) / 2;
}

/**
 * 面積が最大の境界を 1 つだけ返す。区域の外周は大きく、番号付きの小枠などは
 * 小さいので、外周だけを採用して小枠の誤検出を落とす。境界が無ければ空。
 */
export function largestBoundary(
  boundaries: readonly VisionBoundary[],
): VisionBoundary[] {
  let best: VisionBoundary | null = null;
  let bestArea = -1;
  for (const b of boundaries) {
    const area = fractionRingArea(b.vertices);
    if (area > bestArea) {
      bestArea = area;
      best = b;
    }
  }
  return best ? [best] : [];
}
