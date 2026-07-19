// ロード時サニタイズと同期リペア要求の配線検証。
// 不整合（辺が参照する頂点の欠落等）を検出したときだけ
// hvs:sync-repair-requested を発火し、完全 catch-up の即時修復を要求する
// （docs/wants/03「即時リペア要求」/ docs/wants/01「同期完全性の補完」契機 (c)）。
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MapBindingAPI } from "./map-storage";
import { NetworkStorageAdapter } from "./map-storage";
import { SYNC_REPAIR_REQUESTED_EVENT } from "./linkself/shared-events";

function bindingWith(network: unknown): MapBindingAPI {
  return {
    GetNetworkJSON: async () => JSON.stringify(network),
    SaveNetworkJSON: async () => {},
  };
}

describe("NetworkStorageAdapter.loadAll と同期リペア要求", () => {
  let fired: number;
  const onRepair = () => {
    fired++;
  };

  beforeEach(() => {
    fired = 0;
    window.addEventListener(SYNC_REPAIR_REQUESTED_EVENT, onRepair);
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    window.removeEventListener(SYNC_REPAIR_REQUESTED_EVENT, onRepair);
    vi.restoreAllMocks();
  });

  it("整合したデータではリペア要求を発火しない", async () => {
    const adapter = new NetworkStorageAdapter(
      bindingWith({
        vertices: [
          { id: "a", lat: 35, lng: 139 },
          { id: "b", lat: 35, lng: 139 },
        ],
        edges: [{ id: "ab", v1: "a", v2: "b" }],
        polygons: [],
      }),
    );
    await adapter.loadAll();
    expect(fired).toBe(0);
  });

  it("不整合（欠落頂点を参照する辺）を除外したらリペア要求を発火する", async () => {
    const adapter = new NetworkStorageAdapter(
      bindingWith({
        vertices: [{ id: "a", lat: 35, lng: 139 }],
        edges: [{ id: "bad", v1: "a", v2: "MISSING" }],
        polygons: [],
      }),
    );
    const result = await adapter.loadAll();
    expect(result.edges).toEqual([]);
    expect(fired).toBe(1);
  });
});
