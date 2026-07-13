// LocalStorageNetworkStore / LocalStorageConsumedNonceStore の検証。
// ネットワーク実体（メンバー・ロール表）と使用済みノンスがリロード（別イン
// スタンス）をまたいで保持されることが要点。
import { beforeEach, describe, expect, it } from "vitest";
import type { Network } from "@linkself/core";
import {
  LocalStorageConsumedNonceStore,
  LocalStorageNetworkStore,
} from "./network-store";

const NET: Omit<Network, "id"> = {
  suiteId: "jp.home-visit-suite",
  members: ["did:key:zAdmin"],
  memberRoles: { "did:key:zAdmin": "admin" },
};

describe("LocalStorageNetworkStore", () => {
  beforeEach(() => localStorage.clear());

  it("persists a created network across instances (reload)", async () => {
    const a = new LocalStorageNetworkStore();
    const id = await a.createNetwork({ ...NET, id: "" });

    const b = new LocalStorageNetworkStore(); // リロード相当
    const got = await b.getNetwork(id);
    expect(got?.members).toEqual(["did:key:zAdmin"]);
    expect(got?.memberRoles["did:key:zAdmin"]).toBe("admin");
  });

  it("updates and lists by member", async () => {
    const s = new LocalStorageNetworkStore();
    const id = await s.createNetwork({ ...NET, id: "" });
    const n = (await s.getNetwork(id))!;
    n.members.push("did:key:zB");
    n.memberRoles["did:key:zB"] = "member";
    await s.updateNetwork(id, n);

    expect(await s.listForMember("did:key:zB")).toEqual([id]);
    expect((await s.getNetwork(id))?.members).toHaveLength(2);
  });

  it("putNetwork upserts under the exact id (join bootstrap)", async () => {
    const s = new LocalStorageNetworkStore();
    await s.putNetwork({ ...NET, id: "net-snap" });
    expect((await s.getNetwork("net-snap"))?.suiteId).toBe(NET.suiteId);
  });

  it("rejects updating a missing network", async () => {
    const s = new LocalStorageNetworkStore();
    await expect(s.updateNetwork("nope", { ...NET, id: "nope" })).rejects.toMatchObject({
      code: "network_not_found",
    });
  });
});

describe("LocalStorageConsumedNonceStore", () => {
  beforeEach(() => localStorage.clear());

  it("persists consumed nonces across instances (reload)", async () => {
    const a = new LocalStorageConsumedNonceStore();
    await a.add("nonce-1");

    const b = new LocalStorageConsumedNonceStore(); // リロード相当
    expect(await b.has("nonce-1")).toBe(true);
    expect(await b.has("nonce-2")).toBe(false);
  });
});
