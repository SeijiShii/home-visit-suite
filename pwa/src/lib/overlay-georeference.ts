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
 * rotationDeg を与えると、bounds 中心まわりに時計回りへ回転させる（CSS rotate と同符号）。
 * @throws 画像サイズが 0 の場合。
 */
export function overlayPixelToLatLng(
  size: ImageSize,
  bounds: OverlayBounds,
  pixel: Pixel,
  rotationDeg = 0,
): LatLng {
  if (size.width === 0 || size.height === 0) {
    throw new Error("overlayPixelToLatLng: 画像サイズが 0 です");
  }
  const p = {
    lng: bounds.west + (pixel.x / size.width) * (bounds.east - bounds.west),
    lat: bounds.north - (pixel.y / size.height) * (bounds.north - bounds.south),
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

/** 画素空間の境界線群を、オーバーレイ配置に基づき緯度経度ポリゴンへ変換する。 */
export function overlayBoundariesToPolygons(
  size: ImageSize,
  bounds: OverlayBounds,
  boundaries: readonly VisionBoundary[],
  rotationDeg = 0,
): DraftPolygon[] {
  return boundaries.map((b) => ({
    vertices: b.vertices.map((v) =>
      overlayPixelToLatLng(size, bounds, v, rotationDeg),
    ),
  }));
}
