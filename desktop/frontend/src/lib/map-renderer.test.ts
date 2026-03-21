import { describe, it, expect, vi } from "vitest";
import { getPolygonStyle, type VertexDragCallbacks } from "./map-renderer";

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
