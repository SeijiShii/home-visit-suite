// 色ベース境界抽出のピクセル処理テスト（canvas 非依存の純粋関数）。

import { describe, expect, it } from "vitest";
import { isBoundaryColor, maskToBoundaryRings } from "./extract-boundary-color";

describe("isBoundaryColor（赤/ピンク判定・オレンジ除外）", () => {
  it("ピンク・赤は境界色", () => {
    expect(isBoundaryColor(230, 100, 120)).toBe(true); // ピンク
    expect(isBoundaryColor(220, 30, 40)).toBe(true); // 赤
    expect(isBoundaryColor(250, 128, 140)).toBe(true); // サーモンピンク
  });
  it("オレンジ（建物）・白・灰は境界色ではない", () => {
    expect(isBoundaryColor(245, 140, 60)).toBe(false); // オレンジ
    expect(isBoundaryColor(255, 255, 255)).toBe(false); // 白
    expect(isBoundaryColor(150, 150, 150)).toBe(false); // 灰
    expect(isBoundaryColor(40, 40, 40)).toBe(false); // 暗
  });
});

describe("maskToBoundaryRings（太線の輪→外周ポリゴン）", () => {
  it("太い四角の輪から、内側を塗って外周ポリゴンを抽出する", () => {
    const w = 40;
    const h = 40;
    const mask = new Uint8Array(w * h);
    // [8,32]×[8,32] の太さ 3 の輪を立てる。
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const inSquare = x >= 8 && x <= 32 && y >= 8 && y <= 32;
        const onBorder = x <= 11 || x >= 29 || y <= 11 || y >= 29;
        if (inSquare && onBorder) mask[y * w + x] = 1;
      }
    }
    const rings = maskToBoundaryRings(mask, w, h, {
      closeRadius: 2,
      simplifyPx: 1.5,
      minAreaFrac: 0.01,
    });
    expect(rings).toHaveLength(1);
    const ring = rings[0];
    expect(ring.length).toBeGreaterThanOrEqual(4);
    // 概ね四角（囲まれた領域＝境界線を含む enclosed の外周）。
    const xs = ring.map((p) => p.x);
    const ys = ring.map((p) => p.y);
    const spanX = Math.max(...xs) - Math.min(...xs);
    const spanY = Math.max(...ys) - Math.min(...ys);
    expect(spanX).toBeGreaterThan(0.25);
    expect(spanY).toBeGreaterThan(0.25);
    for (const p of ring) {
      expect(p.x).toBeGreaterThanOrEqual(0);
      expect(p.x).toBeLessThanOrEqual(1);
      expect(p.y).toBeGreaterThanOrEqual(0);
      expect(p.y).toBeLessThanOrEqual(1);
    }
  });

  it("細い線（1px の突起）はオープニングで除去され外周に混ざらない", () => {
    const w = 40;
    const h = 40;
    const mask = new Uint8Array(w * h);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const inSquare = x >= 8 && x <= 32 && y >= 8 && y <= 32;
        const onBorder = x <= 11 || x >= 29 || y <= 11 || y >= 29;
        if (inSquare && onBorder) mask[y * w + x] = 1;
      }
    }
    // 太い四角の右辺から 1px の細い突起を伸ばす（x=33..38, y=20）。
    for (let x = 33; x <= 38; x++) mask[20 * w + x] = 1;

    const rings = maskToBoundaryRings(mask, w, h, {
      openRadius: 1,
      closeRadius: 2,
      simplifyPx: 1.5,
      minAreaFrac: 0.01,
    });
    expect(rings).toHaveLength(1);
    // 細い突起(x=38→0.95)は除去され、外周は四角のまま（maxX < 0.9）。
    const maxX = Math.max(...rings[0].map((p) => p.x));
    expect(maxX).toBeLessThan(0.9);
  });

  it("主境界の外側にある注釈矩形（別成分）は外周に混ざらない", () => {
    const w = 60;
    const h = 60;
    const mask = new Uint8Array(w * h);
    // 主境界の太い四角の輪 [10,40]。
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const inSquare = x >= 10 && x <= 40 && y >= 10 && y <= 40;
        const onBorder = x <= 13 || x >= 37 || y <= 13 || y >= 37;
        if (inSquare && onBorder) mask[y * w + x] = 1;
      }
    }
    // 主境界の外側に離れた番号枠の矩形（塗り、x=52..57）。closeRadius=3 の膨張でも
    // 主ループと連結しないので、最大連結成分の抽出で捨てられる。
    for (let y = 25; y <= 30; y++)
      for (let x = 52; x <= 57; x++) mask[y * w + x] = 1;

    const rings = maskToBoundaryRings(mask, w, h, {
      openRadius: 1,
      closeRadius: 3,
      simplifyPx: 1.5,
      minAreaFrac: 0.01,
    });
    expect(rings).toHaveLength(1);
    // 矩形(x=57→0.95)は外周に含まれない（主ループのみ）。
    const maxX = Math.max(...rings[0].map((p) => p.x));
    expect(maxX).toBeLessThan(0.8);
  });

  it("主境界の内側にある注釈矩形（別成分）は外周を内側に削らない", () => {
    const w = 60;
    const h = 60;
    const mask = new Uint8Array(w * h);
    // 主境界の太い四角の輪 [8,52]。
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const inSquare = x >= 8 && x <= 52 && y >= 8 && y <= 52;
        const onBorder = x <= 11 || x >= 49 || y <= 11 || y >= 49;
        if (inSquare && onBorder) mask[y * w + x] = 1;
      }
    }
    // 主境界の内側・境界近傍に注釈矩形（塗り、右辺の内側に密着 x=44..48）。
    // 内側領域方式ではここが切り欠き（削れ）になっていた。
    for (let y = 24; y <= 30; y++)
      for (let x = 44; x <= 48; x++) mask[y * w + x] = 1;

    const rings = maskToBoundaryRings(mask, w, h, {
      openRadius: 1,
      closeRadius: 3,
      simplifyPx: 1.5,
      minAreaFrac: 0.01,
    });
    expect(rings).toHaveLength(1);
    const xs = rings[0].map((p) => p.x);
    const ys = rings[0].map((p) => p.y);
    // 内側領域なので外周は境界線の内側エッジ（一定のインセット）に載る。
    // 矩形で崩れず、概ね四角のまま抽出できる。
    expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThan(0.4);
    expect(Math.max(...ys) - Math.min(...ys)).toBeGreaterThan(0.4);
    // 矩形が内側に密着していても、closing で切り欠きが埋まり右辺まで届く
    // （矩形左端 x=44→0.73 手前で止まらない）。
    expect(Math.max(...xs)).toBeGreaterThan(0.72);
  });

  it("ループに連結して外へ張り出した注釈矩形は opening で突起にならない", () => {
    const w = 60;
    const h = 60;
    const mask = new Uint8Array(w * h);
    // 主境界の太い四角の輪 [10,40]。
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const inSquare = x >= 10 && x <= 40 && y >= 10 && y <= 40;
        const onBorder = x <= 13 || x >= 37 || y <= 13 || y >= 37;
        if (inSquare && onBorder) mask[y * w + x] = 1;
      }
    }
    // 主境界の外側・至近に注釈矩形（塗り、x=42..50, y=22..30）。ループ右辺(x=40)との
    // 隙間は 1px しかないので closeRadius=3 の膨張で連結し、外へ張り出す突起になる。
    for (let y = 22; y <= 30; y++)
      for (let x = 42; x <= 50; x++) mask[y * w + x] = 1;

    const rings = maskToBoundaryRings(mask, w, h, {
      openRadius: 1,
      closeRadius: 3,
      simplifyPx: 1.5,
      minAreaFrac: 0.01,
    });
    expect(rings).toHaveLength(1);
    // 矩形(x=50→0.83)へ張り出さず、外周は主境界の右辺（~0.72）付近に留まる。
    const maxX = Math.max(...rings[0].map((p) => p.x));
    expect(maxX).toBeLessThan(0.78);
  });

  it("境界色が無ければ空を返す", () => {
    const rings = maskToBoundaryRings(new Uint8Array(400), 20, 20);
    expect(rings).toHaveLength(0);
  });
});
