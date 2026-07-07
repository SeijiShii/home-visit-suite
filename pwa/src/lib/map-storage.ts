// ポリゴンネットワーク（vertices / edges / polygons）の永続化。
// desktop の wails-storage-adapter.ts を PWA 向けに置き換えたもの。
//
// 旧構成: Wails MapBinding（GetNetworkJSON / SaveNetworkJSON）が Go 側の
// ネットワーク JSON を読み書きしていた。
// PWA 構成: LinkSelf TS アダプタ完成までの暫定として localStorage に保存する
// （地図データもグループ共有対象なので、最終的には LinkSelf 側へ移す）。

import type { StorageAdapter, Vertex, Edge, PolygonSnapshot } from "map-polygon-editor";

/** ネットワーク JSON の読み書き抽象（旧 Wails MapBinding 相当）。 */
export interface MapBindingAPI {
  GetNetworkJSON(): Promise<string>;
  SaveNetworkJSON(json: string): Promise<void>;
}

const EMPTY_NETWORK = JSON.stringify({ vertices: [], edges: [], polygons: [] });

/** localStorage を用いた MapBindingAPI 実装。 */
export class LocalStorageMapBinding implements MapBindingAPI {
  constructor(private readonly key = "pwa.map.network") {}

  async GetNetworkJSON(): Promise<string> {
    try {
      return localStorage.getItem(this.key) ?? EMPTY_NETWORK;
    } catch {
      return EMPTY_NETWORK;
    }
  }

  async SaveNetworkJSON(json: string): Promise<void> {
    try {
      localStorage.setItem(this.key, json);
    } catch (e) {
      console.error("SaveNetworkJSON failed", e);
    }
  }
}

/** MapBindingAPI を map-polygon-editor の StorageAdapter に適合させる。 */
export class NetworkStorageAdapter implements StorageAdapter {
  constructor(private readonly binding: MapBindingAPI) {}

  async loadAll(): Promise<{
    vertices: Vertex[];
    edges: Edge[];
    polygons: PolygonSnapshot[];
  }> {
    const json = await this.binding.GetNetworkJSON();
    return JSON.parse(json) as {
      vertices: Vertex[];
      edges: Edge[];
      polygons: PolygonSnapshot[];
    };
  }

  async saveAll(data: {
    vertices: Vertex[];
    edges: Edge[];
    polygons: PolygonSnapshot[];
  }): Promise<void> {
    await this.binding.SaveNetworkJSON(JSON.stringify(data));
  }
}
