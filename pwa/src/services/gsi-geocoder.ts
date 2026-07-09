// 国土地理院 住所検索 API を用いた Geocoder 実装。
// docs/wants/03_地図機能.md「AI による区域地図作成」§処理フロー 3（接地）。
//
// 実 API 契約（2026-07 確認）:
//   GET https://msearch.gsi.go.jp/address-search/AddressSearch?q=<query>
//   → GeoJSON Feature の配列
//      [{ geometry: { coordinates: [lng, lat], type: "Point" },
//         properties: { title, addressCode } }]
//
// fetch は注入可能（テストはモック、本番はグローバル fetch）。

import type { Geocoder, GeocodeHit } from "./ai-map-import";

const GSI_ENDPOINT =
  "https://msearch.gsi.go.jp/address-search/AddressSearch";

interface GsiFeature {
  geometry?: { coordinates?: number[] } | null;
  properties?: { title?: string } | null;
}

export class GsiGeocoder implements Geocoder {
  constructor(
    private readonly fetchFn: typeof fetch = fetch,
    private readonly endpoint: string = GSI_ENDPOINT,
  ) {}

  async geocode(query: string): Promise<GeocodeHit[]> {
    const q = query.trim();
    if (q === "") return [];

    const url = `${this.endpoint}?q=${encodeURIComponent(q)}`;
    const res = await this.fetchFn(url);
    if (!res.ok) {
      throw new Error(`GsiGeocoder: 住所検索に失敗しました (HTTP ${res.status})`);
    }

    const body = (await res.json()) as unknown;
    if (!Array.isArray(body)) return [];

    const hits: GeocodeHit[] = [];
    for (const f of body as GsiFeature[]) {
      const coords = f?.geometry?.coordinates;
      const title = f?.properties?.title;
      if (
        !Array.isArray(coords) ||
        coords.length < 2 ||
        typeof coords[0] !== "number" ||
        typeof coords[1] !== "number" ||
        typeof title !== "string"
      ) {
        continue; // 壊れた要素はスキップ
      }
      hits.push({ title, geo: { lat: coords[1], lng: coords[0] } });
    }
    return hits;
  }
}
