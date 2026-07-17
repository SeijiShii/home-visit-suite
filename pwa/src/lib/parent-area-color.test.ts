// 区域親番ごとのポリゴン塗り分け（mod 割り当て）のテスト。
// 仕様: docs/wants/03_地図機能.md「区域親番ごとのポリゴン塗り分け」

import { describe, expect, it } from "vitest";
import {
  PARENT_AREA_POLYGON_COLORS,
  parentAreaColorIndex,
  parentAreaColorPair,
} from "./parent-area-color";

describe("parentAreaColorIndex", () => {
  it("区域親番号の数値を色数で mod してインデックスを返す", () => {
    const n = PARENT_AREA_POLYGON_COLORS.length;
    expect(parentAreaColorIndex("NRT-001-05")).toBe(1 % n);
    expect(parentAreaColorIndex("NRT-002-01")).toBe(2 % n);
    expect(parentAreaColorIndex("NRT-003-10")).toBe(3 % n);
    // 色数ちょうどの親番号は 0 に巻き戻る
    expect(parentAreaColorIndex(`NRT-00${n}-01`)).toBe(0);
  });

  it("同一親番の区域（枝番違い・飛地）は同じインデックスになる", () => {
    expect(parentAreaColorIndex("NRT-001-05")).toBe(
      parentAreaColorIndex("NRT-001-12"),
    );
  });

  it("異なる親番号（隣接番号）は異なるインデックスになる", () => {
    expect(parentAreaColorIndex("NRT-001-05")).not.toBe(
      parentAreaColorIndex("NRT-002-05"),
    );
  });

  it("親番セグメントに数値が無い識別子でも 0..色数-1 の範囲に落ちる", () => {
    const i = parentAreaColorIndex("ABC-XYZ-QQ");
    expect(i).toBeGreaterThanOrEqual(0);
    expect(i).toBeLessThan(PARENT_AREA_POLYGON_COLORS.length);
    expect(Number.isInteger(i)).toBe(true);
  });
});

describe("parentAreaColorPair", () => {
  it("区域IDに応じたパレットの色対を返す", () => {
    const pair = parentAreaColorPair("NRT-001-05");
    expect(pair).toBe(
      PARENT_AREA_POLYGON_COLORS[parentAreaColorIndex("NRT-001-05")],
    );
  });

  it("区域ID未解決（undefined）は色0（従来の green）を返す", () => {
    expect(parentAreaColorPair(undefined)).toBe(PARENT_AREA_POLYGON_COLORS[0]);
  });
});
