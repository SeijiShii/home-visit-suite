// AiMapImportService の統合ロジックのテスト（vision / geocoder は fake で駆動）。
// docs/wants/03_地図機能.md「AI による区域地図作成」§処理フロー / §信頼度による分岐。

import { describe, expect, it } from "vitest";
import { haversineKm, type LatLng } from "../lib/area-detail-geo";
import { latLngToMercator } from "../lib/georeference";
import {
  AiMapImportService,
  type Geocoder,
  type MapVisionProvider,
  type Pixel,
  type VisionExtraction,
} from "./ai-map-import";

// 既知アフィン（メルカトル空間の線形写像）で geo → pixel を作る。
const S = 0.5;
const ORIGIN = latLngToMercator({ lat: 35.767, lng: 140.318 });
const OX = ORIGIN.x - 300 * S;
const OY = ORIGIN.y + 200 * S;
function px(geo: LatLng): Pixel {
  const m = latLngToMercator(geo);
  return { x: (m.x - OX) / S, y: (OY - m.y) / S };
}

// ランドマーク 3 点 + 境界 + 場所番号を含む地図を模した抽出結果。
const LM = [
  { label: "成田駅", geo: { lat: 35.767, lng: 140.318 } },
  { label: "成田小学校", geo: { lat: 35.769, lng: 140.321 } },
  { label: "成田山公園", geo: { lat: 35.766, lng: 140.322 } },
];
const BOUNDARY: LatLng[] = [
  { lat: 35.7665, lng: 140.3185 },
  { lat: 35.7688, lng: 140.3185 },
  { lat: 35.7688, lng: 140.3215 },
  { lat: 35.7665, lng: 140.3215 },
];
const PLACE_A = { lat: 35.7675, lng: 140.3195 };
const PLACE_B = { lat: 35.7682, lng: 140.3205 };

const extraction: VisionExtraction = {
  areaGuess: "成田市 成田周辺",
  landmarks: LM.map((l) => ({ label: l.label, pixel: px(l.geo) })),
  boundaries: [{ vertices: BOUNDARY.map(px) }],
  places: [
    { number: 1, pixel: px(PLACE_A), label: "田中" },
    { number: 2, pixel: px(PLACE_B) },
  ],
};

function fakeVision(result: VisionExtraction): MapVisionProvider {
  return { analyze: async () => result };
}

// ランドマーク名 → 実座標を返す fake geocoder（未登録名は空配列）。
function fakeGeocoder(pairs: { label: string; geo: LatLng }[]): Geocoder {
  const map = new Map(pairs.map((p) => [p.label, p.geo]));
  return {
    geocode: async (q) => {
      const geo = map.get(q);
      return geo ? [{ title: q, geo }] : [];
    },
  };
}

const IMAGE = new Uint8Array([1, 2, 3]).buffer;

describe("AiMapImportService", () => {
  it("3点以上ジオコーディングでき残差小 → high。境界・場所を実座標に写像する", async () => {
    const svc = new AiMapImportService(
      fakeVision(extraction),
      fakeGeocoder(LM),
    );
    const draft = await svc.buildDraft(IMAGE);

    expect(draft.confidence).toBe("high");
    expect(draft.matchedGcps).toHaveLength(3);
    expect(draft.unmatchedLandmarks).toHaveLength(0);
    expect(draft.polygons).toHaveLength(1);

    // 境界頂点が元の緯度経度に 1cm 未満で復元される
    draft.polygons[0].vertices.forEach((v, i) => {
      expect(haversineKm(v, BOUNDARY[i]) * 1000).toBeLessThan(0.01);
    });
    // 場所番号・ラベルは保持、座標は復元
    expect(draft.places.map((p) => p.number)).toEqual([1, 2]);
    expect(draft.places[0].label).toBe("田中");
    expect(haversineKm(draft.places[0].geo, PLACE_A) * 1000).toBeLessThan(0.01);
  });

  it("ジオコーディングできたランドマークが3点未満 → low、下書きは生成しない", async () => {
    const svc = new AiMapImportService(
      fakeVision(extraction),
      fakeGeocoder(LM.slice(0, 2)), // 2点しか当たらない
    );
    const draft = await svc.buildDraft(IMAGE);

    expect(draft.confidence).toBe("low");
    expect(draft.georeference).toBeNull();
    expect(draft.polygons).toHaveLength(0);
    expect(draft.places).toHaveLength(0);
    expect(draft.unmatchedLandmarks).toContain("成田山公園");
  });
});
