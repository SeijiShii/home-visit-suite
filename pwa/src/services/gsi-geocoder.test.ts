// GsiGeocoder（国土地理院 住所検索 API アダプタ）のテスト。fetch はモックで駆動。
// 実 API 契約: GET https://msearch.gsi.go.jp/address-search/AddressSearch?q=<query>
//   → [{ geometry: { coordinates: [lng, lat], type:"Point" }, properties: { title } }]

import { describe, expect, it, vi } from "vitest";
import { GsiGeocoder } from "./gsi-geocoder";

function okResponse(body: unknown): Response {
  return {
    ok: true,
    status: 200,
    json: async () => body,
  } as Response;
}

describe("GsiGeocoder", () => {
  it("GSI の GeoJSON 配列を lat/lng に変換して返す", async () => {
    const fetchFn = vi.fn(async () =>
      okResponse([
        {
          geometry: { coordinates: [140.319229, 35.786263], type: "Point" },
          type: "Feature",
          properties: { title: "千葉県成田市成田", addressCode: "" },
        },
      ]),
    );
    const geocoder = new GsiGeocoder(fetchFn as unknown as typeof fetch);

    const hits = await geocoder.geocode("成田市成田");

    expect(hits).toEqual([
      { title: "千葉県成田市成田", geo: { lat: 35.786263, lng: 140.319229 } },
    ]);
  });

  it("クエリを URL エンコードして GSI エンドポイントを叩く", async () => {
    const fetchFn = vi.fn(async (_url: string) => okResponse([]));
    const geocoder = new GsiGeocoder(fetchFn as unknown as typeof fetch);

    await geocoder.geocode("成田 山");

    const url = fetchFn.mock.calls[0][0] as string;
    expect(url).toContain(
      "https://msearch.gsi.go.jp/address-search/AddressSearch?q=",
    );
    expect(url).toContain(encodeURIComponent("成田 山"));
  });

  it("空クエリは fetch せず空配列を返す", async () => {
    const fetchFn = vi.fn(async () => okResponse([]));
    const geocoder = new GsiGeocoder(fetchFn as unknown as typeof fetch);

    expect(await geocoder.geocode("   ")).toEqual([]);
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("該当なし（空配列）は空配列を返す", async () => {
    const fetchFn = vi.fn(async () => okResponse([]));
    const geocoder = new GsiGeocoder(fetchFn as unknown as typeof fetch);
    expect(await geocoder.geocode("存在しない地名")).toEqual([]);
  });

  it("HTTP エラーは例外を投げる", async () => {
    const fetchFn = vi.fn(
      async () =>
        ({ ok: false, status: 503, json: async () => [] }) as Response,
    );
    const geocoder = new GsiGeocoder(fetchFn as unknown as typeof fetch);
    await expect(geocoder.geocode("成田")).rejects.toThrow(/503/);
  });

  it("不正な座標を含む要素はスキップする", async () => {
    const fetchFn = vi.fn(async () =>
      okResponse([
        {
          geometry: { coordinates: [140.3, 35.7] },
          properties: { title: "有効" },
        },
        { geometry: null, properties: { title: "壊れ" } },
        { geometry: { coordinates: [999] }, properties: { title: "座標不足" } },
      ]),
    );
    const geocoder = new GsiGeocoder(fetchFn as unknown as typeof fetch);
    const hits = await geocoder.geocode("x");
    expect(hits).toEqual([{ title: "有効", geo: { lat: 35.7, lng: 140.3 } }]);
  });
});
