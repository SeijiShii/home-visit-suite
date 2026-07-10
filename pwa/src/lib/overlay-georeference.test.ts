// 手動オーバーレイ整列（Phase 1.2）の座標変換テスト。
// vision は座標を 0.0〜1.0 の比率で返す。Leaflet ImageOverlay は画像を軸平行の
// LatLngBounds に嵌め込むため、(0,0)=左上 → 北西角、(1,1)=右下 → 南東角 の線形写像になる。

import { describe, expect, it } from "vitest";
import type { VisionBoundary } from "../services/ai-map-import";
import {
  largestBoundary,
  overlayBoundariesToPolygons,
  overlayFractionToLatLng,
  type OverlayBounds,
} from "./overlay-georeference";

const BOUNDS: OverlayBounds = {
  north: 35.77,
  south: 35.76,
  west: 140.31,
  east: 140.33,
};

describe("overlayFractionToLatLng", () => {
  it("左上(0,0)は北西角", () => {
    expect(overlayFractionToLatLng(BOUNDS, { x: 0, y: 0 })).toEqual({
      lat: 35.77,
      lng: 140.31,
    });
  });

  it("右下(1,1)は南東角", () => {
    expect(overlayFractionToLatLng(BOUNDS, { x: 1, y: 1 })).toEqual({
      lat: 35.76,
      lng: 140.33,
    });
  });

  it("中央(0.5,0.5)は中心", () => {
    const c = overlayFractionToLatLng(BOUNDS, { x: 0.5, y: 0.5 });
    expect(c.lat).toBeCloseTo(35.765, 9);
    expect(c.lng).toBeCloseTo(140.32, 9);
  });
});

describe("overlayBoundariesToPolygons", () => {
  it("比率境界を軸平行 bounds で緯度経度ポリゴンに変換する", () => {
    const boundaries: VisionBoundary[] = [
      {
        vertices: [
          { x: 0, y: 0 },
          { x: 1, y: 0 },
          { x: 1, y: 1 },
          { x: 0, y: 1 },
        ],
      },
    ];
    const polys = overlayBoundariesToPolygons(BOUNDS, boundaries);
    expect(polys).toHaveLength(1);
    expect(polys[0].vertices).toEqual([
      { lat: 35.77, lng: 140.31 },
      { lat: 35.77, lng: 140.33 },
      { lat: 35.76, lng: 140.33 },
      { lat: 35.76, lng: 140.31 },
    ]);
  });
});

describe("largestBoundary（小枠の誤検出を落とす）", () => {
  const big: VisionBoundary = {
    vertices: [
      { x: 0.1, y: 0.1 },
      { x: 0.9, y: 0.1 },
      { x: 0.9, y: 0.9 },
      { x: 0.1, y: 0.9 },
    ],
  };
  const smallBox: VisionBoundary = {
    vertices: [
      { x: 0.2, y: 0.2 },
      { x: 0.25, y: 0.2 },
      { x: 0.25, y: 0.25 },
      { x: 0.2, y: 0.25 },
    ],
  };

  it("面積最大の外周だけを返す", () => {
    const r = largestBoundary([smallBox, big, smallBox]);
    expect(r).toHaveLength(1);
    expect(r[0]).toBe(big);
  });

  it("空なら空を返す", () => {
    expect(largestBoundary([])).toEqual([]);
  });
});

describe("overlayFractionToLatLng（回転）", () => {
  // 経度圧縮の影響を消すため cos(lat)=1 に近い赤道付近の対称 bounds で検証する。
  const B: OverlayBounds = {
    north: 0.01,
    south: -0.01,
    east: 0.01,
    west: -0.01,
  };

  it("回転 0 は無回転と一致する", () => {
    const p = { x: 1, y: 0.5 }; // 中央右端 = 中心の真東
    expect(overlayFractionToLatLng(B, p, 0)).toEqual(
      overlayFractionToLatLng(B, p),
    );
  });

  it("時計回り 90 度で『真東の点』が『真南』へ移る", () => {
    const east = { x: 1, y: 0.5 }; // 中心の真東
    const r = overlayFractionToLatLng(B, east, 90);
    // 真南 = 経度は中心、緯度は南（負）
    expect(r.lng).toBeCloseTo(0, 6);
    expect(r.lat).toBeLessThan(0);
  });
});
