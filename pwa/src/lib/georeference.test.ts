// 自動ジオリファレンス（画素→緯度経度アフィン変換）のテスト。
// docs/wants/03_地図機能.md「AI による区域地図作成」§自動ジオリファレンス参照。

import { describe, expect, it } from "vitest";
import { haversineKm } from "./area-detail-geo";
import {
  classifyConfidence,
  latLngToMercator,
  mercatorToLatLng,
  pixelToLatLng,
  solveGeoreference,
  type Gcp,
} from "./georeference";

// 成田周辺の実在座標帯で検証する。
const BASE = { lat: 35.767, lng: 140.318 };

// 既知のアフィン（メルカトル空間で pixel = 線形関数）から GCP を生成する。
// px = (mercX - ox) / s, py = (oy - mercY) / s   （画像 y は下向き）
function makeGcp(
  lat: number,
  lng: number,
  s: number,
  ox: number,
  oy: number,
): Gcp {
  const m = latLngToMercator({ lat, lng });
  return {
    pixel: { x: (m.x - ox) / s, y: (oy - m.y) / s },
    geo: { lat, lng },
  };
}

describe("latLngToMercator / mercatorToLatLng", () => {
  it("往復変換で元の緯度経度に戻る", () => {
    const ll = { lat: 35.767, lng: 140.318 };
    const back = mercatorToLatLng(latLngToMercator(ll));
    expect(back.lat).toBeCloseTo(ll.lat, 9);
    expect(back.lng).toBeCloseTo(ll.lng, 9);
  });
});

describe("solveGeoreference", () => {
  const om = latLngToMercator(BASE);
  const s = 0.5; // メルカトルメートル / px
  const ox = om.x - 300 * s;
  const oy = om.y + 200 * s;

  const gcps: Gcp[] = [
    makeGcp(35.767, 140.318, s, ox, oy),
    makeGcp(35.769, 140.321, s, ox, oy),
    makeGcp(35.766, 140.322, s, ox, oy),
    makeGcp(35.7685, 140.3195, s, ox, oy),
  ];

  it("誤差なし GCP なら残差ほぼ 0 で解ける", () => {
    const r = solveGeoreference(gcps);
    expect(r.gcpCount).toBe(4);
    expect(r.rmsMeters).toBeLessThan(0.01);
    expect(r.maxMeters).toBeLessThan(0.01);
  });

  it("解いた変換で GCP の画素が元の緯度経度に戻る", () => {
    const r = solveGeoreference(gcps);
    for (const g of gcps) {
      const got = pixelToLatLng(r.transform, g.pixel);
      // 1cm 未満の誤差
      expect(haversineKm(got, g.geo) * 1000).toBeLessThan(0.01);
    }
  });

  it("保留した点も正しく写像する（外挿ではなく内挿域）", () => {
    const r = solveGeoreference(gcps);
    const held = makeGcp(35.7675, 140.3205, s, ox, oy);
    const got = pixelToLatLng(r.transform, held.pixel);
    expect(haversineKm(got, held.geo) * 1000).toBeLessThan(0.01);
  });

  it("GCP に微小な位置誤差があると残差が増える（外れ値を maxMeters が反映）", () => {
    const noisy = [...gcps];
    // 3点目のピクセルを 4px ずらす（≈ 2m 相当のずれ）
    noisy[2] = {
      ...noisy[2],
      pixel: { x: noisy[2].pixel.x + 4, y: noisy[2].pixel.y },
    };
    const r = solveGeoreference(noisy);
    expect(r.rmsMeters).toBeGreaterThan(0);
    expect(r.maxMeters).toBeGreaterThan(r.rmsMeters);
  });

  it("GCP が 3 点未満なら例外", () => {
    expect(() => solveGeoreference(gcps.slice(0, 2))).toThrow();
  });

  it("残差が小さく GCP が十分なら信頼度 high", () => {
    const r = solveGeoreference(gcps);
    expect(classifyConfidence(r)).toBe("high");
  });

  it("再投影誤差が閾値超過なら信頼度 low", () => {
    const r = solveGeoreference(gcps);
    // 既定 15m に対し 10m 閾値へ厳格化しつつ、maxMeters を人工的に超過させる
    expect(
      classifyConfidence(
        { ...r, maxMeters: 40 },
        { minGcps: 3, maxErrorMeters: 15 },
      ),
    ).toBe("low");
  });

  it("共線な GCP（退化）なら例外", () => {
    const om2 = latLngToMercator(BASE);
    const collinear: Gcp[] = [0, 1, 2, 3].map((i) => {
      const m = { x: om2.x + i * 10, y: om2.y + i * 10 };
      return { pixel: { x: i * 10, y: i * 10 }, geo: mercatorToLatLng(m) };
    });
    expect(() => solveGeoreference(collinear)).toThrow();
  });
});

describe("classifyConfidence の妥当性ガード（0..1 正規化座標）", () => {
  // 正規化座標 (0..1) の単位正方形 → 実座標のアフィンを直接組む。
  // (0,0)=base, (1,0)=base+東 dLng, (0,1)=base+南 dLat。
  function transformFor(dLng: number, dLat: number) {
    const m00 = latLngToMercator(BASE);
    const m10 = latLngToMercator({ lat: BASE.lat, lng: BASE.lng + dLng });
    const m01 = latLngToMercator({ lat: BASE.lat - dLat, lng: BASE.lng });
    return {
      a: m10.x - m00.x,
      b: m01.x - m00.x,
      c: m00.x,
      d: m10.y - m00.y,
      e: m01.y - m00.y,
      f: m00.y,
    };
  }
  const result = (t: ReturnType<typeof transformFor>) => ({
    transform: t,
    rmsMeters: 0,
    maxMeters: 0,
    gcpCount: 3,
  });

  it("画像実寸が妥当（数百m四方）なら high", () => {
    // 約 0.003 度 ≈ 270m 四方
    expect(classifyConfidence(result(transformFor(0.003, 0.0025)))).toBe(
      "high",
    );
  });

  it("画像が広域すぎる（別地域への誤ジオコーディング）なら low", () => {
    // 約 2 度 ≈ 180km 四方 → 対角 > 50km
    expect(classifyConfidence(result(transformFor(2, 2)))).toBe("low");
  });

  it("極端な異方性（共線退化による細長）なら low", () => {
    // 幅 ~1m・高さ ~220km の細い縦長
    expect(classifyConfidence(result(transformFor(0.00001, 2)))).toBe("low");
  });
});
