// ポリゴンスタイル関数の親番塗り分け適用テスト。
// 仕様: docs/wants/03_地図機能.md「区域親番ごとのポリゴン塗り分け」
// ・区域編集画面: 紐付け済みの輪郭/塗りを親番色で塗り分け
// ・訪問記録画面（詳細モード）: 輪郭は従来色のまま、親番色を極薄塗りで適用

import { describe, expect, it } from "vitest";
import { getAreaDetailPolygonStyle, getPolygonStyle } from "./map-renderer";
import {
  parentAreaColorPair,
  PARENT_AREA_POLYGON_COLORS,
} from "./parent-area-color";

describe("getPolygonStyle: 区域編集画面の親番塗り分け", () => {
  it("紐付け済みポリゴンは親番色（非選択=base/選択=selected）になる", () => {
    const pair = parentAreaColorPair("NRT-002-05");
    expect(getPolygonStyle(true, false, "NRT-002-05").color).toBe(pair.base);
    expect(getPolygonStyle(true, true, "NRT-002-05").color).toBe(pair.selected);
  });

  it("区域ID未解決の紐付け済みポリゴンは色0（従来の green）", () => {
    expect(getPolygonStyle(true, false).color).toBe(
      PARENT_AREA_POLYGON_COLORS[0].base,
    );
  });

  it("未紐付けポリゴンは灰色（無彩色）", () => {
    expect(getPolygonStyle(false, false, "NRT-002-05").color).toBe("#94a3b8");
    expect(getPolygonStyle(false, true, "NRT-002-05").color).toBe("#475569");
  });
});

describe("getAreaDetailPolygonStyle: 訪問記録画面の極薄塗り", () => {
  it("対象区域: 輪郭はオレンジのまま、親番色の極薄塗りが付く", () => {
    const style = getAreaDetailPolygonStyle("target", "NRT-001-05");
    expect(style.color).toBe("#f97316");
    expect(style.fillColor).toBe(parentAreaColorPair("NRT-001-05").base);
    expect(style.fillOpacity).toBeGreaterThan(0);
    expect(style.fillOpacity).toBeLessThanOrEqual(0.1);
  });

  it("隣接区域: 輪郭は水色のまま、親番色の極薄塗りが付く", () => {
    const style = getAreaDetailPolygonStyle("neighbor", "NRT-003-01");
    expect(style.color).toBe("#38bdf8");
    expect(style.fillColor).toBe(parentAreaColorPair("NRT-003-01").base);
    expect(style.fillOpacity).toBeGreaterThan(0);
    expect(style.fillOpacity).toBeLessThanOrEqual(0.1);
  });

  it("区域ID未解決時は色0 の極薄塗りにフォールバックする", () => {
    const style = getAreaDetailPolygonStyle("neighbor");
    expect(style.fillColor).toBe(PARENT_AREA_POLYGON_COLORS[0].base);
  });
});
