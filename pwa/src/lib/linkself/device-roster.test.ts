// @vitest-environment node
// node env: @linkself/core の Ed25519 verify は jsdom の WebCrypto では失敗するため
// （linkself 系 pwa テストは node env で回す）。node に localStorage は無いので
// 最小 shim を用意する。
import {
  buildRoster,
  generateIdentity,
  marshalRoster,
  rosterHasDevice,
  verifyRoster,
} from "@linkself/core";
import { beforeEach, describe, expect, it } from "vitest";
import {
  addDeviceToRoster,
  consumePendingSiblingDevices,
  loadOrCreateRoster,
  setDeviceLabelInRoster,
} from "./device-roster";
import { ROSTER_UPDATED_EVENT } from "./shared-events";

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

  it("rev 0（旧 v1）で永続済みのロスターは掲載台数を下限に rev 移行する", async () => {
    const user = await generateIdentity();
    const devA = await generateIdentity();
    const devB = await generateIdentity();
    // 旧版（rev 導入前）が残した v1 ロスターを模す
    const legacy = await buildRoster(
      user,
      [
        { deviceDID: devA.did, label: "PC" },
        { deviceDID: devB.did, label: "スマホ" },
      ],
      0,
    );
    localStorage.setItem(
      "hvs.deviceRoster",
      new TextDecoder().decode(marshalRoster(legacy)),
    );

    const upgraded = await loadOrCreateRoster(user, devA.did);
    // 台数(2)を下限に rev 化 → 新端末の fresh rev(1〜2) に全面採用で負けず、
    // union 経路に落ちるため既存の兄弟端末が脱落しない。
    expect(upgraded.rev).toBeGreaterThanOrEqual(2);
    expect(rosterHasDevice(upgraded, devA.did)).toBe(true);
    expect(rosterHasDevice(upgraded, devB.did)).toBe(true);
    expect(await verifyRoster(upgraded)).toBe(true);
    expect(upgraded.devices.find((d) => d.deviceDID === devB.did)?.label).toBe(
      "スマホ",
    );
  });

  it("新規ロスターは rev 1 で始まり、変更のたびに rev が上がる（v2 正規形）", async () => {
    const user = await generateIdentity();
    const devA = await generateIdentity();
    const devB = await generateIdentity();
    const r1 = await loadOrCreateRoster(user, devA.did);
    expect(r1.rev).toBe(1);
    const r2 = await addDeviceToRoster(user, r1, devB.did, "Phone");
    expect(r2.rev).toBe(2);
    expect(await verifyRoster(r2)).toBe(true);
  });

  it("setDeviceLabelInRoster はラベルを差し替え rev+1 で再署名・永続する", async () => {
    const user = await generateIdentity();
    const devA = await generateIdentity();
    const devB = await generateIdentity();
    const r1 = await addDeviceToRoster(
      user,
      await loadOrCreateRoster(user, devA.did),
      devB.did,
      "Phone",
    );
    const r2 = await setDeviceLabelInRoster(user, r1, devB.did, "スマホ");
    expect(r2.rev).toBe(r1.rev + 1);
    expect(r2.devices.find((d) => d.deviceDID === devB.did)?.label).toBe(
      "スマホ",
    );
    expect(r2.devices).toHaveLength(r1.devices.length);
    expect(await verifyRoster(r2)).toBe(true);
    // 永続済み（リロード後も新ラベル）。
    const r3 = await loadOrCreateRoster(user, devA.did);
    expect(r3.devices.find((d) => d.deviceDID === devB.did)?.label).toBe(
      "スマホ",
    );
  });

  it("setDeviceLabelInRoster は未掲載デバイスには何もしない", async () => {
    const user = await generateIdentity();
    const devA = await generateIdentity();
    const r1 = await loadOrCreateRoster(user, devA.did);
    const r2 = await setDeviceLabelInRoster(
      user,
      r1,
      "did:key:zUnknownDevice",
      "x",
    );
    expect(r2).toBe(r1);
  });

  it("永続のたびに hvs:roster-updated イベントを発火する（UI 即時反映）", async () => {
    const user = await generateIdentity();
    const devA = await generateIdentity();
    const devB = await generateIdentity();
    let fired = 0;
    const g = globalThis as unknown as {
      dispatchEvent?: (e: Event) => boolean;
    };
    const orig = g.dispatchEvent;
    g.dispatchEvent = (e: Event) => {
      if (e.type === ROSTER_UPDATED_EVENT) fired++;
      return true;
    };
    try {
      const r1 = await loadOrCreateRoster(user, devA.did); // fresh → persist
      expect(fired).toBe(1);
      await addDeviceToRoster(user, r1, devB.did); // add → persist
      expect(fired).toBe(2);
    } finally {
      if (orig) g.dispatchEvent = orig;
      else delete (g as { dispatchEvent?: unknown }).dispatchEvent;
    }
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
