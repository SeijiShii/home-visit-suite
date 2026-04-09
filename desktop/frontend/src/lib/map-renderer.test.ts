import { describe, it, expect, vi } from "vitest";
import {
  getPolygonStyle,
  getAreaDetailPolygonStyle,
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
