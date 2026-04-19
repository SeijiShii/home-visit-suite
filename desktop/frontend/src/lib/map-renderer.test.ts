import { describe, it, expect, vi } from "vitest";
import {
  getPolygonStyle,
  getAreaDetailPolygonStyle,
  getPlaceMarkerColor,
  getPlaceMarkerRadius,
  getPlaceBadgeText,
  getPlaceMarkerOpacity,
  type VertexDragCallbacks,
  type MapRendererCallbacks,
} from "./map-renderer";

describe("VertexDragCallbacks 型", () => {
  it("onDragStart / onDragMove / onDragEnd の3コールバックを持つ", () => {
    const callbacks: VertexDragCallbacks = {
      onDragStart: vi.fn(),
      onDragMove: vi.fn(),
      onDragEnd: vi.fn(),
    };
    expect(callbacks.onDragStart).toBeDefined();
    expect(callbacks.onDragMove).toBeDefined();
    expect(callbacks.onDragEnd).toBeDefined();
  });
});

describe("getPolygonStyle", () => {
  it("紐づき+選択: 濃い緑", () => {
    const style = getPolygonStyle(true, true);
    expect(style.color).toBe("#166534");
    expect(style.fillOpacity).toBe(0.35);
    expect(style.weight).toBe(3);
  });

  it("紐づき+非選択: 薄い緑", () => {
    const style = getPolygonStyle(true, false);
    expect(style.color).toBe("#22c55e");
    expect(style.fillOpacity).toBe(0.15);
    expect(style.weight).toBe(2);
  });

  it("未紐づき+選択: 濃い青", () => {
    const style = getPolygonStyle(false, true);
    expect(style.color).toBe("#1e40af");
    expect(style.fillOpacity).toBe(0.35);
    expect(style.weight).toBe(3);
  });

  it("未紐づき+非選択: 薄い青", () => {
    const style = getPolygonStyle(false, false);
    expect(style.color).toBe("#3b82f6");
    expect(style.fillOpacity).toBe(0.15);
    expect(style.weight).toBe(2);
  });
});

describe("getAreaDetailPolygonStyle", () => {
  it("対象区域は濃色・線太め・塗りつぶしなし", () => {
    const s = getAreaDetailPolygonStyle("target");
    expect(s.fillOpacity).toBe(0);
    expect(s.weight).toBeGreaterThanOrEqual(3);
    expect(s.color).toMatch(/^#[0-9a-f]{6}$/i);
  });

  it("隣接区域は薄色・細線・塗りつぶしなし", () => {
    const s = getAreaDetailPolygonStyle("neighbor");
    expect(s.fillOpacity).toBe(0);
    expect(s.weight).toBeLessThan(3);
  });

  it("対象と隣接で色が異なる", () => {
    expect(getAreaDetailPolygonStyle("target").color).not.toBe(
      getAreaDetailPolygonStyle("neighbor").color,
    );
  });
});

describe("getPlaceMarkerColor", () => {
  it("house は青系", () => {
    expect(getPlaceMarkerColor("house")).toMatch(/^#[0-9a-f]{6}$/i);
  });
  it("type ごとに色が異なる", () => {
    const c1 = getPlaceMarkerColor("house");
    const c2 = getPlaceMarkerColor("building");
    const c3 = getPlaceMarkerColor("room");
    expect(new Set([c1, c2, c3]).size).toBe(3);
  });
});

describe("getPlaceMarkerRadius", () => {
  it("ズームレベルが上がると半径も増える", () => {
    const small = getPlaceMarkerRadius(13);
    const big = getPlaceMarkerRadius(19);
    expect(big).toBeGreaterThan(small);
  });
  it("最小 8px / 最大 14px の範囲にクランプ", () => {
    expect(getPlaceMarkerRadius(0)).toBe(8);
    expect(getPlaceMarkerRadius(99)).toBe(14);
  });
});

describe("getPlaceBadgeText", () => {
  it("returns 1-based number for zero index", () => {
    expect(getPlaceBadgeText(0)).toBe("1");
  });
  it("returns 1-based number for positive index", () => {
    expect(getPlaceBadgeText(4)).toBe("5");
  });
});

describe("getPlaceMarkerOpacity", () => {
  it("未選択時は既存の塗り 0.55 / 枠 0.85 を維持する", () => {
    expect(getPlaceMarkerOpacity(false)).toEqual({
      fillOpacity: 0.55,
      opacity: 0.85,
    });
  });
  it("選択時は塗りと枠の不透明度が未選択時より高い", () => {
    const sel = getPlaceMarkerOpacity(true);
    const un = getPlaceMarkerOpacity(false);
    expect(sel.fillOpacity).toBeGreaterThan(un.fillOpacity);
    expect(sel.opacity).toBeGreaterThanOrEqual(un.opacity);
    expect(sel.fillOpacity).toBeLessThanOrEqual(1);
    expect(sel.opacity).toBeLessThanOrEqual(1);
  });
});

describe("MapRendererCallbacks.onContextMenu", () => {
  it("lat, lng, containerX, containerY の4引数を受け取れる型である", () => {
    const onContextMenu =
      vi.fn<
        (
          lat: number,
          lng: number,
          containerX: number,
          containerY: number,
        ) => void
      >();
    const callbacks: MapRendererCallbacks = { onContextMenu };
    callbacks.onContextMenu!(35.0, 140.0, 150, 300);
    expect(onContextMenu).toHaveBeenCalledWith(35.0, 140.0, 150, 300);
  });
});
