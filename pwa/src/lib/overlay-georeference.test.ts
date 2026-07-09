// 手動オーバーレイ整列（Phase 1.2）の座標変換テスト。
// Leaflet ImageOverlay は画像を軸平行の LatLngBounds に嵌め込むため、
// 画素 (0,0)=左上 → 北西角、(w,h)=右下 → 南東角 の線形写像になる。

import { describe, expect, it } from "vitest";
import type { VisionBoundary } from "../services/ai-map-import";
import {
  overlayBoundariesToPolygons,
  overlayPixelToLatLng,
  type OverlayBounds,
  type ImageSize,
} from "./overlay-georeference";

const SIZE: ImageSize = { width: 200, height: 100 };
const BOUNDS: OverlayBounds = {
  north: 35.77,
  south: 35.76,
  west: 140.31,
  east: 140.33,
};

describe("overlayPixelToLatLng", () => {
  it("左上画素は北西角", () => {
    expect(overlayPixelToLatLng(SIZE, BOUNDS, { x: 0, y: 0 })).toEqual({
      lat: 35.77,
      lng: 140.31,
    });
  });

  it("右下画素は南東角", () => {
    expect(
      overlayPixelToLatLng(SIZE, BOUNDS, { x: 200, y: 100 }),
    ).toEqual({ lat: 35.76, lng: 140.33 });
  });

  it("中央画素は中心", () => {
    const c = overlayPixelToLatLng(SIZE, BOUNDS, { x: 100, y: 50 });
    expect(c.lat).toBeCloseTo(35.765, 9);
    expect(c.lng).toBeCloseTo(140.32, 9);
  });
});

describe("overlayBoundariesToPolygons", () => {
  it("画素境界を軸平行 bounds で緯度経度ポリゴンに変換する", () => {
    const boundaries: VisionBoundary[] = [
      {
        vertices: [
          { x: 0, y: 0 },
          { x: 200, y: 0 },
          { x: 200, y: 100 },
          { x: 0, y: 100 },
        ],
      },
    ];
    const polys = overlayBoundariesToPolygons(SIZE, BOUNDS, boundaries);
    expect(polys).toHaveLength(1);
    expect(polys[0].vertices).toEqual([
      { lat: 35.77, lng: 140.31 },
      { lat: 35.77, lng: 140.33 },
      { lat: 35.76, lng: 140.33 },
      { lat: 35.76, lng: 140.31 },
    ]);
  });

  it("画像サイズが 0 なら例外（0 除算防止）", () => {
    expect(() =>
      overlayPixelToLatLng({ width: 0, height: 100 }, BOUNDS, { x: 1, y: 1 }),
    ).toThrow();
  });
});
