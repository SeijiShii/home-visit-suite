// ペアリング payload 拡張（デバイス DID・ロスター・所属グループ同梱）の
// 収集/適用テスト。docs/wants/01「ペアリング payload の拡張」参照。
// 発行側: collectPairingExtras がローカル状態から拡張フィールドを組み立てる。
// 受信側: applyPairingExtras がロスター保存・グループの器（スロット+networkId+
// ネットワーク実体）作成を行う。

import { beforeEach, describe, expect, it } from "vitest";
import { identityFromSeed, seedToBase64 } from "./identity-crypto";
import {
  getActiveGroupSlot,
  listGroupSlots,
  nsKey,
  repoPrefix,
} from "./group-slots";
import {
  applyPairingExtras,
  applyPairingExtrasIfMissing,
  collectPairingExtras,
} from "./pairing-extras";

function randomSeed(): Uint8Array {
  const seed = new Uint8Array(32);
  crypto.getRandomValues(seed);
  return seed;
}

describe("pairing-extras 収集（発行側）", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("デバイス DID・ロスター・networkId 確定済みグループを収集する", async () => {
    const deviceSeed = randomSeed();
    localStorage.setItem("hvs.deviceKeySeed", seedToBase64(deviceSeed));
    // ロスターは自分（hvs.identity）のユーザー DID のものだけ同梱される。
    localStorage.setItem(
      "hvs.identity",
      JSON.stringify({
        did: "did:key:zU",
        seedB64: "",
        name: "",
        role: "admin",
      }),
    );
    localStorage.setItem("hvs.deviceRoster", '{"userDID":"did:key:zU"}');
    // スロット2つ: networkId 確定済みと未確定（未確定は同梱しない）。
    localStorage.setItem(
      "hvs.groups",
      JSON.stringify([
        { slotId: "g-aaaaaaaa", networkId: "net-1", groupName: "第一" },
        { slotId: "g-bbbbbbbb", networkId: null, groupName: null },
      ]),
    );
    // フル実体（全メンバー）がローカルにあっても、QR には自分のメンバーシップ
    // だけの最小スナップショットを載せる（QR 密度をグループ人数に依存させない）。
    localStorage.setItem(
      "hvs.networks",
      JSON.stringify({
        "net-1": {
          id: "net-1",
          suiteId: "jp.home-visit-suite",
          members: ["did:key:zU", "did:key:zOther"],
          memberRoles: { "did:key:zU": "admin", "did:key:zOther": "member" },
        },
      }),
    );

    const extras = await collectPairingExtras();
    const expectedDid = (await identityFromSeed(deviceSeed)).did;
    expect(extras.deviceDid).toBe(expectedDid);
    expect(extras.rosterJson).toBe('{"userDID":"did:key:zU"}');
    expect(extras.groups).toEqual([
      {
        networkId: "net-1",
        groupName: "第一",
        network: {
          id: "net-1",
          suiteId: "jp.home-visit-suite",
          members: ["did:key:zU"],
          memberRoles: { "did:key:zU": "admin" },
        },
      },
    ]);
  });

  it("ローカル状態が無ければ空の拡張を返す（旧環境互換）", async () => {
    const extras = await collectPairingExtras();
    expect(extras.deviceDid).toBeUndefined();
    expect(extras.rosterJson).toBeUndefined();
    expect(extras.groups).toEqual([]);
  });

  it("別ユーザーのロスター残骸は同梱しない", async () => {
    localStorage.setItem(
      "hvs.identity",
      JSON.stringify({ did: "did:key:zMe", seedB64: "", name: "", role: "" }),
    );
    localStorage.setItem(
      "hvs.deviceRoster",
      '{"userDID":"did:key:zSomeoneElse","devices":[]}',
    );
    const extras = await collectPairingExtras();
    expect(extras.rosterJson).toBeUndefined();
  });
});

describe("pairing-extras 適用（受信側）", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("ロスターを保存し、グループの器（スロット+networkId+実体）を作って先頭をアクティブにする", () => {
    applyPairingExtras({
      rosterJson: '{"userDID":"did:key:zU","devices":[]}',
      groups: [
        {
          networkId: "net-1",
          groupName: "第一",
          network: { id: "net-1", members: ["did:key:zU"] },
        },
        { networkId: "net-2", groupName: null },
      ],
    });

    expect(localStorage.getItem("hvs.deviceRoster")).toBe(
      '{"userDID":"did:key:zU","devices":[]}',
    );
    const slots = listGroupSlots();
    expect(slots).toHaveLength(2);
    expect(slots[0].networkId).toBe("net-1");
    expect(slots[0].groupName).toBe("第一");
    expect(localStorage.getItem(nsKey(slots[0].slotId, "networkId"))).toBe(
      "net-1",
    );
    expect(localStorage.getItem(nsKey(slots[1].slotId, "networkId"))).toBe(
      "net-2",
    );
    // ネットワーク実体は共通ストア（hvs.networks）に入る。
    const networks = JSON.parse(localStorage.getItem("hvs.networks") ?? "{}");
    expect(networks["net-1"].members).toEqual(["did:key:zU"]);
    // 先頭グループがアクティブになる。
    expect(getActiveGroupSlot()?.slotId).toBe(slots[0].slotId);
    // repo 名前空間はスロット毎に分かれる前提（他テストの回帰防止の確認のみ）。
    expect(repoPrefix(slots[0].slotId)).not.toBe(repoPrefix(slots[1].slotId));
  });

  it("拡張フィールドが無い旧 payload では何もしない", () => {
    applyPairingExtras({});
    expect(listGroupSlots()).toHaveLength(0);
    expect(localStorage.getItem("hvs.deviceRoster")).toBeNull();
  });
});

describe("pairing-extras 不足分のみ適用（同一 DID 再スキャン）", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("器を持たない端末には適用し true を返す", () => {
    const applied = applyPairingExtrasIfMissing({
      did: "did:key:zU",
      rosterJson: '{"userDID":"did:key:zU","devices":[{"deviceDID":"d1"}]}',
      groups: [{ networkId: "net-1", groupName: "第一" }],
    });
    expect(applied).toBe(true);
    const slots = listGroupSlots();
    expect(slots).toHaveLength(1);
    expect(slots[0].networkId).toBe("net-1");
    expect(localStorage.getItem("hvs.deviceRoster")).toContain("d1");
  });

  it("確立済みの端末（同グループの器 + 複数端末ロスター）には何もしない", () => {
    const local =
      '{"userDID":"did:key:zU","devices":[{"deviceDID":"d1"},{"deviceDID":"d2"}]}';
    localStorage.setItem("hvs.deviceRoster", local);
    applyPairingExtras({
      groups: [{ networkId: "net-1", groupName: "第一" }],
    });
    const before = listGroupSlots();

    const applied = applyPairingExtrasIfMissing({
      did: "did:key:zU",
      rosterJson: '{"userDID":"did:key:zU","devices":[{"deviceDID":"d3"}]}',
      groups: [{ networkId: "net-1", groupName: "第一" }],
    });
    expect(applied).toBe(false);
    expect(listGroupSlots()).toEqual(before);
    expect(localStorage.getItem("hvs.deviceRoster")).toBe(local);
  });

  it("自分のみのロスターは payload 側（兄弟入り）で置き換える", () => {
    localStorage.setItem(
      "hvs.deviceRoster",
      '{"userDID":"did:key:zU","devices":[{"deviceDID":"self"}]}',
    );
    const incoming =
      '{"userDID":"did:key:zU","devices":[{"deviceDID":"pc"},{"deviceDID":"phone"}]}';
    const applied = applyPairingExtrasIfMissing({
      did: "did:key:zU",
      rosterJson: incoming,
    });
    expect(applied).toBe(true);
    expect(localStorage.getItem("hvs.deviceRoster")).toBe(incoming);
  });

  it("別ユーザーのロスターは取り込まない", () => {
    const applied = applyPairingExtrasIfMissing({
      did: "did:key:zU",
      rosterJson: '{"userDID":"did:key:zOther","devices":[{"deviceDID":"x"}]}',
    });
    expect(applied).toBe(false);
    expect(localStorage.getItem("hvs.deviceRoster")).toBeNull();
  });
});
