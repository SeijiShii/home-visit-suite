// normalizeExtraction の座標正規化テスト。
// vision は 0〜1000 の正規化座標を返すことが多いため、0〜1 の比率へ換算し
// [0,1] にクランプする（範囲外による洋上飛び出しを防ぐ）。

import { describe, expect, it } from "vitest";
import { extractJson, normalizeExtraction } from "./map-vision-extraction";

describe("normalizeExtraction の座標正規化", () => {
  it("0〜1000 系（最大値>1.5）は ÷1000 で 0〜1 に換算する", () => {
    const r = normalizeExtraction({
      landmarks: [{ label: "駅", pixel: { x: 500, y: 250 } }],
      boundaries: [
        {
          vertices: [
            { x: 0, y: 0 },
            { x: 1000, y: 0 },
            { x: 1000, y: 800 },
          ],
        },
      ],
      places: [{ number: 1, pixel: { x: 100, y: 900 } }],
    });
    expect(r.landmarks[0].pixel).toEqual({ x: 0.5, y: 0.25 });
    expect(r.boundaries[0].vertices).toEqual([
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 1, y: 0.8 },
    ]);
    expect(r.places[0].pixel).toEqual({ x: 0.1, y: 0.9 });
  });

  it("既に 0〜1 系（最大値≤1.5）はそのまま", () => {
    const r = normalizeExtraction({
      boundaries: [
        {
          vertices: [
            { x: 0.1, y: 0.2 },
            { x: 0.9, y: 0.8 },
          ],
        },
      ],
    });
    expect(r.boundaries[0].vertices).toEqual([
      { x: 0.1, y: 0.2 },
      { x: 0.9, y: 0.8 },
    ]);
  });

  it("範囲外（>1000 相当）の座標は [0,1] にクランプする", () => {
    // モデルが 4000 のような外れ値を返しても洋上へ飛ばさない
    const r = normalizeExtraction({
      boundaries: [
        {
          vertices: [
            { x: 4000, y: -50 },
            { x: 1000, y: 1000 },
          ],
        },
      ],
    });
    expect(r.boundaries[0].vertices).toEqual([
      { x: 1, y: 0 },
      { x: 1, y: 1 },
    ]);
  });

  it("座標が無い/空でも壊れない", () => {
    const r = normalizeExtraction({});
    expect(r).toEqual({ landmarks: [], boundaries: [], places: [] });
  });
});

describe("extractJson", () => {
  it("```json フェンスから本体を取り出す", () => {
    expect(extractJson('```json\n{"a":1}\n```')).toBe('{"a":1}');
  });
  it("前後に説明文があっても { } 範囲を抜き出す", () => {
    expect(extractJson('結果は {"a":1} です')).toBe('{"a":1}');
  });
});
