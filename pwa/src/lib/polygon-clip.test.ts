// alignAndClipPolygon: 新ポリゴンを既存へスナップ＋差集合クリップする。

import { describe, expect, it } from "vitest";
import type { LatLng } from "./area-detail-geo";
import { alignAndClipPolygon } from "./polygon-clip";

// 既存の四角形（成田付近）。lat[35.767,35.768] × lng[140.318,140.319]。
const E: LatLng[] = [
  { lat: 35.767, lng: 140.318 },
  { lat: 35.768, lng: 140.318 },
  { lat: 35.768, lng: 140.319 },
  { lat: 35.767, lng: 140.319 },
];

function rect(
  latLo: number,
  latHi: number,
  lngLo: number,
  lngHi: number,
): LatLng[] {
  return [
    { lat: latLo, lng: lngLo },
    { lat: latHi, lng: lngLo },
    { lat: latHi, lng: lngHi },
    { lat: latLo, lng: lngHi },
  ];
}

describe("alignAndClipPolygon", () => {
  it("既存が無ければそのまま返す", () => {
    const r = alignAndClipPolygon(E, []);
    expect(r).toHaveLength(1);
    expect(r[0]).toHaveLength(4);
  });

  it("既存と重なる新ポリゴンは重なりを除去して外側だけ残す", () => {
    // 右半分が E と重なる新ポリゴン（lng 140.3185〜140.320）。
    const N = rect(35.767, 35.768, 140.3185, 140.32);
    const r = alignAndClipPolygon(N, [E], { snapMeters: 0, minAreaM2: 0 });
    expect(r).toHaveLength(1);
    // 結果はすべて E の右端(140.319)以東（重なり部分が消える）。
    for (const v of r[0]) {
      expect(v.lng).toBeGreaterThanOrEqual(140.319 - 1e-9);
    }
  });

  it("既存と辺を接するだけ（内部は重ならない）新ポリゴンはそのまま残る", () => {
    // E の右端(140.319)にちょうど接する新ポリゴン（内部は重ならない）。
    const adj = rect(35.767, 35.768, 140.319, 140.32);
    const r = alignAndClipPolygon(adj, [E], { snapMeters: 5, minAreaM2: 0 });
    expect(r).toHaveLength(1);
    expect(r[0].length).toBeGreaterThanOrEqual(3);
  });

  it("既存の内側に完全に含まれる新ポリゴンは空になる", () => {
    const inside = rect(35.7672, 35.7678, 140.3182, 140.3188);
    const r = alignAndClipPolygon(inside, [E], { snapMeters: 0, minAreaM2: 0 });
    expect(r).toHaveLength(0);
  });

  it("既存と離れた新ポリゴンはそのまま残る", () => {
    const far = rect(35.78, 35.781, 140.33, 140.331);
    const r = alignAndClipPolygon(far, [E], { snapMeters: 5, minAreaM2: 0 });
    expect(r).toHaveLength(1);
    expect(r[0]).toHaveLength(4);
  });

  it("既存にとても近い（隙間ある）境界は既存へスナップする", () => {
    // E の右端(140.319)より ~3.6m 東に左辺がある新ポリゴン。
    const gap = 0.00004; // ≈ 3.6m
    const N = rect(35.767, 35.768, 140.319 + gap, 140.32);
    const r = alignAndClipPolygon(N, [E], { snapMeters: 5, minAreaM2: 0 });
    expect(r).toHaveLength(1);
    // 左辺の頂点が既存の右端 140.319 に吸着している。
    const hasSnapped = r[0].some((v) => Math.abs(v.lng - 140.319) < 1e-9);
    expect(hasSnapped).toBe(true);
  });

  it("極小破片は minAreaM2 未満で捨てる", () => {
    // E とほぼ全体が重なり、外側にごく僅かだけはみ出す新ポリゴン。
    const N = rect(35.767, 35.768, 140.318, 140.319 + 0.0000001);
    const r = alignAndClipPolygon(N, [E], { snapMeters: 0, minAreaM2: 5 });
    expect(r).toHaveLength(0);
  });
});
