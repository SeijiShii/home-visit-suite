// ポリゴンネットワーク（vertices / edges / polygons）の永続化。
// desktop の wails-storage-adapter.ts を PWA 向けに置き換えたもの。
//
// 旧構成: Wails MapBinding（GetNetworkJSON / SaveNetworkJSON）が Go 側の
// ネットワーク JSON を読み書きしていた。
// PWA 構成: LinkSelf TS アダプタ完成までの暫定として localStorage に保存する
// （地図データもグループ共有対象なので、最終的には LinkSelf 側へ移す）。

import type {
  StorageAdapter,
  Vertex,
  Edge,
  PolygonSnapshot,
} from "map-polygon-editor";
import { sanitizeNetworkSnapshot } from "./network-sanitize";
import { requestSyncRepair } from "./linkself/shared-events";

/** ネットワーク JSON の読み書き抽象（旧 Wails MapBinding 相当）。 */
export interface MapBindingAPI {
  GetNetworkJSON(): Promise<string>;
  SaveNetworkJSON(json: string): Promise<void>;
  /**
   * ロード時サニタイズで除外した辺・面 ID を「エディタに提供していない行」
   * として通知する（任意実装）。差分保存で削除候補（＝提供済みなのに保存
   * スナップショットに無い行）から外し、除外行を墓石化しないため（docs/wants/03
   * 「ロード時のネットワーク整合性サニタイズ」）。localStorage 実装は単一端末
   * のため no-op でよい。
   */
  MarkNotServed?(dropped: { edges: string[]; polygons: string[] }): void;
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
    const raw = JSON.parse(json) as {
      vertices: Vertex[];
      edges: Edge[];
      polygons: PolygonSnapshot[];
    };
    // ローカル DB の不整合（P2P 同期の部分適用等）でエディタ初期化ごと
    // 落ちないよう、整合しない辺・面をメモリ上でのみ除外する（書き戻さない）。
    const result = sanitizeNetworkSnapshot(raw);
    // 除外行を「エディタに提供していない行」として binding に通知する。差分
    // 保存の削除候補から外し、除外しただけの行を墓石化しないため（エディタは
    // 知らないだけで削除の意図ではない。実障害: 2026-07-19 スマホの不完全
    // データ保存が PC の完全な行を墓石化しかけた）。DB へは触れないため、
    // 除外行の墓石が別途届けば正しく削除され、resurrection も起きない。
    this.binding.MarkNotServed?.({
      edges: result.droppedEdgeIds,
      polygons: result.droppedPolygonIds,
    });
    if (
      result.droppedEdgeIds.length > 0 ||
      result.droppedPolygonIds.length > 0
    ) {
      console.warn(
        "[map-storage] ネットワーク不整合を検出し除外しました（非破壊）:",
        result.droppedEdgeIds,
        result.droppedPolygonIds,
      );
      // 不整合＝ライブ配送の取りこぼし疑い。差分 catch-up では高水位の下に
      // 埋まった欠落行を取り返せないため、完全 catch-up の即時リペアを要求
      // する（docs/wants/03「即時リペア要求」）。
      requestSyncRepair();
    }
    return result.data;
  }

  async saveAll(data: {
    vertices: Vertex[];
    edges: Edge[];
    polygons: PolygonSnapshot[];
  }): Promise<void> {
    await this.binding.SaveNetworkJSON(JSON.stringify(data));
  }
}
