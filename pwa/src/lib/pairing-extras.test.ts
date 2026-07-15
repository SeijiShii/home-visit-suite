// ペアリング payload 拡張（鍵＋最小限のポインタのみ）の収集/適用テスト。
// docs/wants/01「ペアリング payload の拡張」参照。
// - 発行側: collectPairingExtras = デバイス DID と所属グループの ID/名前だけを収集
//   （ロスター本体・メンバー表は QR に載せない）
// - 受信側: applyPairingExtras = デバイス DID をロスター追加待ちに積み、
//   グループの器（スロット + networkId + 合成した最小実体）を作る

import { beforeEach, describe, expect, it } from "vitest";
import { identityFromSeed, seedToBase64 } from "./identity-crypto";
import {
  getActiveGroupSlot,
  listGroupSlots,
  nsKey,
} from "./group-slots";
import {
  applyPairingExtras,
  applyPairingExtrasIfMissing,
  collectPairingExtras,
  PENDING_SIBLING_DEVICES_KEY,
} from "./pairing-extras";

function randomSeed(): Uint8Array {
  const seed = new Uint8Array(32);
  crypto.getRandomValues(seed);
  return seed;
}

function pendingSiblings(): { u: string; d: string }[] {
  return JSON.parse(
    localStorage.getItem(PENDING_SIBLING_DEVICES_KEY) ?? "[]",
  ) as { u: string; d: string }[];
}

describe("pairing-extras 収集（発行側）", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("デバイス DID と networkId 確定済みグループの ID/名前だけを収集する", async () => {
    const deviceSeed = randomSeed();
    localStorage.setItem("hvs.deviceKeySeed", seedToBase64(deviceSeed));
    localStorage.setItem(
      "hvs.groups",
      JSON.stringify([
        { slotId: "g-aaaaaaaa", networkId: "net-1", groupName: "第一" },
        { slotId: "g-bbbbbbbb", networkId: null, groupName: null },
      ]),
    );
    localStorage.setItem(
      "hvs.identity",
      JSON.stringify({ did: "did:key:zU", role: "member" }),
    );
    // フル実体がローカルにあっても QR には載せない（鍵とポインタのみ）。
    // 実体の自ロール（editor）が identity のグローバルロール（member）に優先。
    localStorage.setItem(
      "hvs.networks",
      JSON.stringify({
        "net-1": {
          id: "net-1",
          members: ["a", "did:key:zU"],
          memberRoles: { "did:key:zU": "editor" },
        },
      }),
    );

    const extras = await collectPairingExtras();
    expect(extras.deviceDid).toBe((await identityFromSeed(deviceSeed)).did);
    // ロールはグループ実体の自ロール（グループ毎に異なり得る）を載せる。
    expect(extras.groups).toEqual([
      { networkId: "net-1", groupName: "第一", role: "editor" },
    ]);
    expect(JSON.stringify(extras)).not.toContain("members");
  });

  it("ローカル状態が無ければ空の拡張を返す（旧環境互換）", async () => {
    const extras = await collectPairingExtras();
    expect(extras.deviceDid).toBeUndefined();
    expect(extras.groups).toEqual([]);
  });
});

describe("pairing-extras 適用（受信側）", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("デバイス DID を追加待ちに積み、グループの器と合成実体を作って先頭をアクティブにする", () => {
    applyPairingExtras({
      did: "did:key:zU",
      role: "admin",
      deviceDid: "did:key:zPcDevice",
      groups: [
        { networkId: "net-1", groupName: "第一" },
        { networkId: "net-2", groupName: null },
      ],
    });

    expect(pendingSiblings()).toEqual([
      { u: "did:key:zU", d: "did:key:zPcDevice" },
    ]);
    const slots = listGroupSlots();
    expect(slots).toHaveLength(2);
    expect(slots[0].networkId).toBe("net-1");
    expect(slots[0].groupName).toBe("第一");
    expect(localStorage.getItem(nsKey(slots[0].slotId, "networkId"))).toBe(
      "net-1",
    );
    // ネットワーク実体は自分のメンバーシップのみで合成される。
    const networks = JSON.parse(localStorage.getItem("hvs.networks") ?? "{}");
    expect(networks["net-1"]).toEqual({
      id: "net-1",
      suiteId: "jp.home-visit-suite",
      members: ["did:key:zU"],
      memberRoles: { "did:key:zU": "admin" },
    });
    expect(getActiveGroupSlot()?.slotId).toBe(slots[0].slotId);
  });

  it("拡張フィールドが無い旧 payload では何もしない", () => {
    applyPairingExtras({ did: "did:key:zU", role: "member" });
    expect(listGroupSlots()).toHaveLength(0);
    expect(pendingSiblings()).toEqual([]);
  });
});

describe("pairing-extras 残骸への耐性", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("自分を含まない残骸実体（別ユーザー時代）は合成実体で上書きする", () => {
    localStorage.setItem(
      "hvs.networks",
      JSON.stringify({
        "net-1": { id: "net-1", members: ["did:key:zOldUser"] },
      }),
    );
    applyPairingExtras({
      did: "did:key:zU",
      role: "member",
      groups: [{ networkId: "net-1", groupName: null, role: "member" }],
    });
    const networks = JSON.parse(localStorage.getItem("hvs.networks") ?? "{}");
    expect(networks["net-1"].members).toEqual(["did:key:zU"]);
  });

  it("自分を含む既存実体（同一ユーザーの残骸）は温存する", () => {
    const full = {
      id: "net-1",
      members: ["did:key:zU", "did:key:zOther"],
      memberRoles: { "did:key:zU": "admin", "did:key:zOther": "member" },
    };
    localStorage.setItem("hvs.networks", JSON.stringify({ "net-1": full }));
    applyPairingExtras({
      did: "did:key:zU",
      role: "admin",
      groups: [{ networkId: "net-1", groupName: null }],
    });
    const networks = JSON.parse(localStorage.getItem("hvs.networks") ?? "{}");
    expect(networks["net-1"]).toEqual(full);
  });

  it("ロスター登録済みのデバイスは追加待ちに再キューしない", () => {
    localStorage.setItem(
      "hvs.deviceRoster",
      JSON.stringify({
        userDID: "did:key:zU",
        devices: [{ deviceDID: "did:key:zPcDevice", label: "" }],
        sig: "x",
      }),
    );
    const applied = applyPairingExtrasIfMissing({
      did: "did:key:zU",
      role: "member",
      deviceDid: "did:key:zPcDevice",
    });
    expect(applied).toBe(false);
    expect(pendingSiblings()).toEqual([]);
  });
});

describe("pairing-extras 不足分のみ適用（同一 DID 再スキャン）", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("器を持たない端末には適用し true を返す", () => {
    const applied = applyPairingExtrasIfMissing({
      did: "did:key:zU",
      role: "member",
      deviceDid: "did:key:zPcDevice",
      groups: [{ networkId: "net-1", groupName: "第一" }],
    });
    expect(applied).toBe(true);
    expect(listGroupSlots()).toHaveLength(1);
    expect(pendingSiblings()).toEqual([
      { u: "did:key:zU", d: "did:key:zPcDevice" },
    ]);
  });

  it("確立済みの端末（同グループの器 + 追加待ち登録済み）には何もしない", () => {
    applyPairingExtras({
      did: "did:key:zU",
      role: "member",
      deviceDid: "did:key:zPcDevice",
      groups: [{ networkId: "net-1", groupName: "第一" }],
    });
    const before = listGroupSlots();

    const applied = applyPairingExtrasIfMissing({
      did: "did:key:zU",
      role: "member",
      deviceDid: "did:key:zPcDevice",
      groups: [{ networkId: "net-1", groupName: "第一" }],
    });
    expect(applied).toBe(false);
    expect(listGroupSlots()).toEqual(before);
  });
});
