// @vitest-environment node
// node env: @linkself/core の Ed25519 verify は jsdom の WebCrypto では失敗するため
// （linkself 系 pwa テストは node env で回す）。node に localStorage は無いので
// 最小 shim を用意する。
import {
  generateIdentity,
  rosterHasDevice,
  verifyRoster,
} from "@linkself/core";
import { beforeEach, describe, expect, it } from "vitest";
import {
  addDeviceToRoster,
  consumePendingSiblingDevices,
  loadOrCreateRoster,
} from "./device-roster";

class MemStorage {
  private m = new Map<string, string>();
  getItem(k: string): string | null {
    return this.m.has(k) ? this.m.get(k)! : null;
  }
  setItem(k: string, v: string): void {
    this.m.set(k, v);
  }
  removeItem(k: string): void {
    this.m.delete(k);
  }
  clear(): void {
    this.m.clear();
  }
}

describe("device roster manager", () => {
  beforeEach(() => {
    (globalThis as { localStorage?: unknown }).localStorage = new MemStorage();
  });

  it("creates a fresh roster with self registered, signed by the user", async () => {
    const user = await generateIdentity();
    const dev = await generateIdentity();
    const roster = await loadOrCreateRoster(user, dev.did, "PC");
    expect(roster.userDID).toBe(user.did);
    expect(rosterHasDevice(roster, dev.did)).toBe(true);
    expect(await verifyRoster(roster)).toBe(true);
  });

  it("persists and reloads the identical roster", async () => {
    const user = await generateIdentity();
    const dev = await generateIdentity();
    const r1 = await loadOrCreateRoster(user, dev.did);
    const r2 = await loadOrCreateRoster(user, dev.did);
    expect(r2.devices).toEqual(r1.devices);
    expect(Array.from(r2.sig)).toEqual(Array.from(r1.sig));
  });

  it("self-registers into an existing roster missing this device", async () => {
    const user = await generateIdentity();
    const devA = await generateIdentity();
    const devB = await generateIdentity();
    await loadOrCreateRoster(user, devA.did); // roster starts with A
    const roster = await loadOrCreateRoster(user, devB.did); // B loads → self-adds
    expect(rosterHasDevice(roster, devA.did)).toBe(true);
    expect(rosterHasDevice(roster, devB.did)).toBe(true);
    expect(await verifyRoster(roster)).toBe(true);
  });

  it("replaces a roster that belongs to a different user", async () => {
    const userA = await generateIdentity();
    const userB = await generateIdentity();
    const dev = await generateIdentity();
    await loadOrCreateRoster(userA, dev.did);
    const roster = await loadOrCreateRoster(userB, dev.did);
    expect(roster.userDID).toBe(userB.did);
    expect(rosterHasDevice(roster, dev.did)).toBe(true);
    expect(await verifyRoster(roster)).toBe(true);
  });

  it("addDeviceToRoster adds, re-signs, and persists", async () => {
    const user = await generateIdentity();
    const devA = await generateIdentity();
    const devB = await generateIdentity();
    const r1 = await loadOrCreateRoster(user, devA.did);
    const r2 = await addDeviceToRoster(user, r1, devB.did, "Phone");
    expect(rosterHasDevice(r2, devB.did)).toBe(true);
    expect(await verifyRoster(r2)).toBe(true);
    // A reload sees the added device (persisted).
    const r3 = await loadOrCreateRoster(user, devA.did);
    expect(rosterHasDevice(r3, devB.did)).toBe(true);
  });
});

describe("consumePendingSiblingDevices（ペアリング payload 由来の兄弟取り込み）", () => {
  beforeEach(() => {
    (globalThis as { localStorage?: unknown }).localStorage = new MemStorage();
  });

  it("自ユーザー宛の控えだけを追加署名し、控えキーを消費する", async () => {
    const user = await generateIdentity();
    const dev = await generateIdentity();
    const pc = await generateIdentity();
    const roster = await loadOrCreateRoster(user, dev.did);
    localStorage.setItem(
      "hvs.pendingSiblingDevices",
      JSON.stringify([
        { u: user.did, d: pc.did },
        { u: "did:key:zSomeoneElse", d: "did:key:zEvilDevice" },
      ]),
    );

    const updated = await consumePendingSiblingDevices(user, roster);

    expect(rosterHasDevice(updated, pc.did)).toBe(true);
    // 別ユーザー宛の残骸は署名せず捨てる。
    expect(rosterHasDevice(updated, "did:key:zEvilDevice")).toBe(false);
    expect(await verifyRoster(updated)).toBe(true);
    expect(localStorage.getItem("hvs.pendingSiblingDevices")).toBeNull();
    // 永続済み（次回起動の loadOrCreateRoster が取り込み済みロスターを返す）。
    const reloaded = await loadOrCreateRoster(user, dev.did);
    expect(rosterHasDevice(reloaded, pc.did)).toBe(true);
  });

  it("控えが無ければロスターを変えない（冪等）", async () => {
    const user = await generateIdentity();
    const dev = await generateIdentity();
    const roster = await loadOrCreateRoster(user, dev.did);
    const updated = await consumePendingSiblingDevices(user, roster);
    expect(updated).toBe(roster);
  });
});
