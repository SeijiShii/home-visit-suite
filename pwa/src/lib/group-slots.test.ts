// グループスロット（グループ毎のローカル DB 名前空間）のテスト。
// docs/wants/01_共通基盤.md「グループ毎のローカル DB 分離」参照。
// - スロット: slotId / networkId / groupName。アクティブポインタは常に 1 つ
// - 名前空間: キー `hvs.g.<slotId>.<key>` / repo プレフィクス `hvs.g.<slotId>`
// - 旧単一グループデータ（無印 hvs:* / hvs.networkId 等）は一度きり移行
// - スロット削除（脱退・別 DID への紐づけ直し）は名前空間キーごと破棄

import { beforeEach, describe, expect, it } from "vitest";
import {
  attachNetworkId,
  createGroupSlot,
  ensureActiveSlot,
  getActiveGroupSlot,
  groupDbFilename,
  listGroupSlots,
  migrateLegacyGroupData,
  nsKey,
  purgeAllGroupSlots,
  purgeGroupSlot,
  repoPrefix,
  setActiveGroupSlot,
  setSlotGroupName,
} from "./group-slots";

describe("group-slots グループ名前空間", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("ensureActiveSlot はスロットが無ければ作成し、以後は同じスロットを返す（冪等）", () => {
    const first = ensureActiveSlot();
    expect(first.slotId).toMatch(/^g-[0-9a-f]{8}$/);
    expect(getActiveGroupSlot()?.slotId).toBe(first.slotId);
    const second = ensureActiveSlot();
    expect(second.slotId).toBe(first.slotId);
    expect(listGroupSlots()).toHaveLength(1);
  });

  it("スロットの作成・切替・属性更新ができる", () => {
    const a = ensureActiveSlot();
    const b = createGroupSlot({ groupName: "第二グループ" });
    expect(listGroupSlots()).toHaveLength(2);
    expect(getActiveGroupSlot()?.slotId).toBe(a.slotId);

    setActiveGroupSlot(b.slotId);
    expect(getActiveGroupSlot()?.slotId).toBe(b.slotId);
    expect(getActiveGroupSlot()?.groupName).toBe("第二グループ");

    attachNetworkId(b.slotId, "net-b");
    setSlotGroupName(b.slotId, "改名グループ");
    const updated = listGroupSlots().find((s) => s.slotId === b.slotId);
    expect(updated?.networkId).toBe("net-b");
    expect(updated?.groupName).toBe("改名グループ");
  });

  it("名前空間キー・repo プレフィクス・グループ DB ファイル名を導出する", () => {
    const slot = ensureActiveSlot();
    expect(nsKey(slot.slotId, "networkId")).toBe(
      `hvs.g.${slot.slotId}.networkId`,
    );
    expect(repoPrefix(slot.slotId)).toBe(`hvs.g.${slot.slotId}`);
    expect(groupDbFilename(slot.slotId)).toBe(`hvs-group-${slot.slotId}.db`);
  });

  it("旧単一グループデータを一度だけスロット名前空間へ移行する", () => {
    // 旧形式のデータを再現する。
    localStorage.setItem("hvs:user", JSON.stringify([{ id: "u1" }]));
    localStorage.setItem("hvs:region", JSON.stringify([{ id: "r1" }]));
    localStorage.setItem("hvs.networkId", "net-legacy");
    localStorage.setItem("hvs.groupName", "旧グループ");
    localStorage.setItem("hvs.knownMembers", JSON.stringify({ d: ["a"] }));
    localStorage.setItem("hvs.scopedTables", JSON.stringify(["users"]));
    localStorage.setItem("hvs.sharedRecords", "{}");
    localStorage.setItem("hvs.membershipEpochs", "{}");
    localStorage.setItem("pwa.map.network", '{"polygons":[]}');

    migrateLegacyGroupData();

    const slot = getActiveGroupSlot();
    expect(slot).not.toBeNull();
    expect(slot!.networkId).toBe("net-legacy");
    expect(slot!.groupName).toBe("旧グループ");
    // repo データは名前空間プレフィクスへ移動する。
    expect(localStorage.getItem(`${repoPrefix(slot!.slotId)}:user`)).toBe(
      JSON.stringify([{ id: "u1" }]),
    );
    expect(localStorage.getItem(`${repoPrefix(slot!.slotId)}:region`)).toBe(
      JSON.stringify([{ id: "r1" }]),
    );
    expect(localStorage.getItem("hvs:user")).toBeNull();
    // グループ状態キーも名前空間へ移動する。
    expect(localStorage.getItem(nsKey(slot!.slotId, "networkId"))).toBe(
      "net-legacy",
    );
    expect(localStorage.getItem(nsKey(slot!.slotId, "knownMembers"))).toBe(
      JSON.stringify({ d: ["a"] }),
    );
    expect(localStorage.getItem(nsKey(slot!.slotId, "scopedTables"))).toBe(
      JSON.stringify(["users"]),
    );
    expect(localStorage.getItem("hvs.networkId")).toBeNull();
    expect(localStorage.getItem("hvs.groupName")).toBeNull();
    // 共有レコード・epoch・地図ネットワークも名前空間へ移動する。
    expect(localStorage.getItem(nsKey(slot!.slotId, "sharedRecords"))).toBe(
      "{}",
    );
    expect(localStorage.getItem(nsKey(slot!.slotId, "membershipEpochs"))).toBe(
      "{}",
    );
    expect(
      localStorage.getItem(`${repoPrefix(slot!.slotId)}:map.network`),
    ).toBe('{"polygons":[]}');
    expect(localStorage.getItem("hvs.sharedRecords")).toBeNull();
    expect(localStorage.getItem("pwa.map.network")).toBeNull();

    // 一度きり: 再実行してもスロットが増えない。
    migrateLegacyGroupData();
    expect(listGroupSlots()).toHaveLength(1);
  });

  it("旧データが無ければ移行はスロットを作らない", () => {
    migrateLegacyGroupData();
    expect(listGroupSlots()).toHaveLength(0);
    expect(getActiveGroupSlot()).toBeNull();
  });

  it("purgeGroupSlot はスロットと名前空間キーを破棄し、アクティブを別スロットへ移す", () => {
    const a = ensureActiveSlot();
    const b = createGroupSlot({ groupName: "B" });
    localStorage.setItem(nsKey(a.slotId, "networkId"), "net-a");
    localStorage.setItem(`${repoPrefix(a.slotId)}:user`, "[]");
    localStorage.setItem(nsKey(b.slotId, "networkId"), "net-b");

    purgeGroupSlot(a.slotId);

    // OPFS のグループ DB は同期 API では消せないため、孤児として
    // 実体位置（専用プールディレクトリ）付きで記録される。
    const orphans = JSON.parse(
      localStorage.getItem("hvs.orphanGroupDbs") ?? "[]",
    ) as { file: string; dir: string }[];
    expect(orphans.map((e) => e.file)).toContain(groupDbFilename(a.slotId));
    expect(orphans[0].dir).toMatch(/^\.sahpool-hvs-group-/);
    expect(listGroupSlots().map((s) => s.slotId)).toEqual([b.slotId]);
    expect(localStorage.getItem(nsKey(a.slotId, "networkId"))).toBeNull();
    expect(localStorage.getItem(`${repoPrefix(a.slotId)}:user`)).toBeNull();
    // 残存スロットの名前空間は保全される（汚染しない）。
    expect(localStorage.getItem(nsKey(b.slotId, "networkId"))).toBe("net-b");
    expect(getActiveGroupSlot()?.slotId).toBe(b.slotId);
  });

  it("purgeAllGroupSlots は全スロットと全名前空間キーを破棄する（別 DID への紐づけ直し用）", () => {
    const a = ensureActiveSlot();
    const b = createGroupSlot({});
    localStorage.setItem(nsKey(a.slotId, "networkId"), "net-a");
    localStorage.setItem(`${repoPrefix(b.slotId)}:user`, "[]");

    purgeAllGroupSlots();

    expect(listGroupSlots()).toHaveLength(0);
    expect(getActiveGroupSlot()).toBeNull();
    expect(localStorage.getItem(nsKey(a.slotId, "networkId"))).toBeNull();
    expect(localStorage.getItem(`${repoPrefix(b.slotId)}:user`)).toBeNull();
  });
});
