// 端末 transport 鍵の永続を検証する（jsdom の localStorage を使用）。
import { peerIdFromPrivateKey } from "@libp2p/peer-id";
import { beforeEach, describe, expect, it } from "vitest";
import { loadOrCreateDeviceTransportKey } from "./device-key";

describe("loadOrCreateDeviceTransportKey", () => {
  beforeEach(() => localStorage.clear());

  it("returns a stable device peerId across calls (persisted)", async () => {
    const p1 = peerIdFromPrivateKey(await loadOrCreateDeviceTransportKey());
    const p2 = peerIdFromPrivateKey(await loadOrCreateDeviceTransportKey());
    expect(p1.toString()).toBe(p2.toString());
  });

  it("regenerates a distinct key after storage is cleared", async () => {
    const p1 = peerIdFromPrivateKey(await loadOrCreateDeviceTransportKey());
    localStorage.clear();
    const p2 = peerIdFromPrivateKey(await loadOrCreateDeviceTransportKey());
    expect(p1.toString()).not.toBe(p2.toString());
  });

  it("recovers from a corrupted stored seed", async () => {
    localStorage.setItem("hvs.deviceKeySeed", "not-valid-base64!!!");
    const key = await loadOrCreateDeviceTransportKey();
    // 壊れた値でも例外を投げず新しい鍵を生成し、以降は安定する。
    const again = peerIdFromPrivateKey(await loadOrCreateDeviceTransportKey());
    expect(peerIdFromPrivateKey(key).toString()).toBe(again.toString());
  });
});
