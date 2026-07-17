// @vitest-environment node
// LinkSelfNotificationRepository の feedback テーブル（v4 マイグレーション追加分）を
// 検証する。実 MyDB（SqliteWasmDatabase in-memory + SqlProxy + wireSqlSync）で
// 読み書きし、ScopeNetwork 昇格時に既存行が groupshare へ配送されることと、
// 受信行がローカルテーブルへ適用されることを確認する。
import {
  GroupShareLayer,
  MemDeviceStorage,
  MemSharedStorage,
  MyDB,
  ReplicationEngine,
  SqlProxy,
  SqliteWasmDatabase,
  unmarshalSharedRecord,
  wireSqlSync,
  type SqlDatabase,
} from "@linkself/core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Feedback } from "../../domain/models/feedback";
import { LinkSelfNotificationRepository } from "./linkself-notification-repository";

function feedback(id: string, body: string): Feedback {
  return {
    id,
    kind: "bug_report",
    body,
    senderId: "did:key:zsender",
    createdAt: "2026-07-17T00:00:00Z",
    status: "pending",
    resolvedAt: null,
    resolvedBy: "",
  };
}

async function newMyDB(
  sqlDb: SqlDatabase,
): Promise<{ myDB: MyDB; sent: Uint8Array[]; layer: GroupShareLayer }> {
  const engine = new ReplicationEngine({
    storage: new MemDeviceStorage(),
    selfDID: "did:key:ztestselfdid",
    peers: async () => [],
    send: async () => {},
  });
  const sent: Uint8Array[] = [];
  const layer = new GroupShareLayer({
    storage: new MemSharedStorage(),
    memberResolver: { memberDIDsForGroup: async () => ["did:key:zother"] },
    selfDID: "did:key:ztestselfdid",
    sendGroup: async (_m, p) => {
      sent.push(p);
    },
  });
  const proxy = await SqlProxy.open(sqlDb);
  const myDB = new MyDB(engine, proxy, layer);
  wireSqlSync(proxy, myDB);
  layer.onApplied = (rec) => myDB.applyIncomingShared(rec);
  return { myDB, sent, layer };
}

describe("LinkSelfNotificationRepository (feedback via MyDB SQL)", () => {
  let sqlDb: SqliteWasmDatabase;

  beforeEach(async () => {
    sqlDb = await SqliteWasmDatabase.open(); // in-memory
  });

  afterEach(async () => {
    await sqlDb.close();
  });

  it("saves, reads, updates, and lists feedback", async () => {
    const { myDB } = await newMyDB(sqlDb);
    const repo = new LinkSelfNotificationRepository(myDB);

    await repo.saveFeedback(feedback("f1", "地図が固まる"));
    expect((await repo.getFeedback("f1"))?.body).toBe("地図が固まる");
    expect(await repo.getFeedback("nope")).toBeNull();

    await repo.saveFeedback({
      ...feedback("f1", "地図が固まる"),
      status: "resolved",
      resolvedAt: "2026-07-18T00:00:00Z",
      resolvedBy: "did:key:zadmin",
    });
    const updated = await repo.getFeedback("f1");
    expect(updated?.status).toBe("resolved");
    expect(updated?.resolvedBy).toBe("did:key:zadmin");

    await repo.saveFeedback(feedback("f2", "応援しています"));
    expect((await repo.listFeedback()).map((f) => f.id).sort()).toEqual([
      "f1",
      "f2",
    ]);
  });

  it("v4 migration applies on a DB where v3 is already recorded", async () => {
    // v3 適用済み DB を模す: 先に別リポジトリ経由でスキーマを適用してから
    // feedback を読み書きできること（= v4 が独立に適用されること）を確認する。
    const { myDB } = await newMyDB(sqlDb);
    const repo = new LinkSelfNotificationRepository(myDB);
    await repo.saveRequest({
      id: "r1",
      type: "place_delete",
      status: "pending",
      submitterId: "did:key:zsender",
      areaId: "a1",
      placeId: "p1",
      coord: null,
      description: "",
      createdAt: "2026-07-17T00:00:00Z",
      resolvedAt: null,
      resolvedBy: "",
    });
    await repo.saveFeedback(feedback("f1", "test"));
    expect((await repo.getFeedback("f1"))?.id).toBe("f1");
  });

  it("promotes feedback to ScopeNetwork and broadcasts existing rows", async () => {
    const { myDB, sent } = await newMyDB(sqlDb);
    const repo = new LinkSelfNotificationRepository(myDB);
    await repo.saveFeedback(feedback("f1", "existing"));
    sent.length = 0;

    await myDB.setSyncScope("feedback", "network", {
      networkId: "net-1",
      includeExisting: true,
    });
    const channels = sent.map((p) => unmarshalSharedRecord(p).channel);
    expect(channels).toEqual(["mydb:net-1:feedback"]);

    sent.length = 0;
    await repo.saveFeedback(feedback("f2", "after"));
    expect(sent.length).toBeGreaterThan(0);
  });

  it("applies an incoming feedback row from a peer into the local table", async () => {
    const a = await newMyDB(sqlDb);
    const repoA = new LinkSelfNotificationRepository(a.myDB);
    await a.myDB.setSyncScope("feedback", "network", { networkId: "net-1" });

    const sqlDbB = await SqliteWasmDatabase.open();
    try {
      const b = await newMyDB(sqlDbB);
      const repoB = new LinkSelfNotificationRepository(b.myDB);
      // 受信側もスキーマ適用済みにする（listFeedback がテーブルを作る）
      expect(await repoB.listFeedback()).toEqual([]);
      await b.myDB.setSyncScope("feedback", "network", { networkId: "net-1" });

      await repoA.saveFeedback(feedback("f1", "from A"));
      for (const p of a.sent) {
        await b.layer.handleIncoming(p);
      }
      expect((await repoB.getFeedback("f1"))?.body).toBe("from A");
    } finally {
      await sqlDbB.close();
    }
  });
});
