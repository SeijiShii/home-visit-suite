// 手動オーバーレイ整列（Phase 1.2、低信頼フォールバック）の座標変換。
// ユーザーがアップロード画像を実地図に軸平行オーバーレイして位置合わせした結果
// （画像の自然サイズ + 配置した LatLngBounds）から、画素 → 緯度経度を線形写像する。
// docs/wants/03_地図機能.md §信頼度による分岐 / Phase 1.2。

import type { LatLng } from "./area-detail-geo";
import type { DraftPolygon, VisionBoundary } from "../services/ai-map-import";
import type { Pixel } from "./georeference";

/** 画像の自然（ピクセル）サイズ。 */
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
 * 画素 → 緯度経度。画素 (0,0)=左上 が北西角、(w,h)=右下 が南東角。
 * @throws 画像サイズが 0 の場合。
 */
export function overlayPixelToLatLng(
  size: ImageSize,
  bounds: OverlayBounds,
  pixel: Pixel,
): LatLng {
  if (size.width === 0 || size.height === 0) {
    throw new Error("overlayPixelToLatLng: 画像サイズが 0 です");
  }
  return {
    lng: bounds.west + (pixel.x / size.width) * (bounds.east - bounds.west),
    lat: bounds.north - (pixel.y / size.height) * (bounds.north - bounds.south),
  };
}

/** 画素空間の境界線群を、オーバーレイ配置に基づき緯度経度ポリゴンへ変換する。 */
export function overlayBoundariesToPolygons(
  size: ImageSize,
  bounds: OverlayBounds,
  boundaries: readonly VisionBoundary[],
): DraftPolygon[] {
  return boundaries.map((b) => ({
    vertices: b.vertices.map((v) => overlayPixelToLatLng(size, bounds, v)),
  }));
}
