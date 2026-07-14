// @vitest-environment node
// LinkSelfUserRepository（users/member_tags = MyDB SQL）を検証する。
// 実 MyDB（SqliteWasmDatabase in-memory + SqlProxy + wireSqlSync）で読み書きし、
// 同一 SQL DB 上にリポジトリを作り直しても値が残る（SQL ストア側に永続している）
// ことと、ScopeNetwork 昇格時に既存データが groupshare へ配送されることを確認する。
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
import type { User } from "../../domain/models/user";
import {
  LinkSelfUserRepository,
  USER_SYNC_TABLES,
} from "./linkself-user-repository";

function user(id: string, name: string): User {
  return {
    id,
    name,
    role: "member",
    tagIds: ["t1"],
    joinedAt: "2026-07-14T00:00:00Z",
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

describe("LinkSelfUserRepository (users/member_tags via MyDB SQL)", () => {
  let sqlDb: SqliteWasmDatabase;

  beforeEach(async () => {
    sqlDb = await SqliteWasmDatabase.open(); // in-memory
  });

  afterEach(async () => {
    await sqlDb.close();
  });

  it("saves, reads, updates, and deletes users (tagIds round-trip as JSON)", async () => {
    const { myDB } = await newMyDB(sqlDb);
    const repo = new LinkSelfUserRepository(myDB);

    await repo.saveUser(user("did:key:za", "Alice"));
    expect((await repo.getUser("did:key:za"))?.name).toBe("Alice");
    expect((await repo.getUser("did:key:za"))?.tagIds).toEqual(["t1"]);

    await repo.saveUser({ ...user("did:key:za", "Alice2"), role: "admin" });
    const updated = await repo.getUser("did:key:za");
    expect(updated?.name).toBe("Alice2");
    expect(updated?.role).toBe("admin");

    await repo.saveUser(user("did:key:zb", "Bob"));
    expect((await repo.listUsers()).map((u) => u.name).sort()).toEqual([
      "Alice2",
      "Bob",
    ]);

    await repo.deleteUser("did:key:zb");
    expect(await repo.getUser("did:key:zb")).toBeNull();
  });

  it("persists across repository instances (SQL store, not the repo, holds data)", async () => {
    const { myDB } = await newMyDB(sqlDb);
    await new LinkSelfUserRepository(myDB).saveUser(user("did:key:za", "A"));
    const again = new LinkSelfUserRepository(myDB);
    expect((await again.listUsers()).map((u) => u.id)).toEqual(["did:key:za"]);
  });

  it("saves and deletes member tags", async () => {
    const { myDB } = await newMyDB(sqlDb);
    const repo = new LinkSelfUserRepository(myDB);
    await repo.saveTag({ id: "t1", name: "ベテラン", color: "#3b82f6" });
    expect(await repo.listTags()).toEqual([
      { id: "t1", name: "ベテラン", color: "#3b82f6" },
    ]);
    await repo.deleteTag("t1");
    expect(await repo.listTags()).toEqual([]);
  });

  it("promotes users/member_tags to ScopeNetwork and broadcasts existing data", async () => {
    const { myDB, sent } = await newMyDB(sqlDb);
    const repo = new LinkSelfUserRepository(myDB);
    await repo.saveUser(user("did:key:za", "Alice"));
    await repo.saveTag({ id: "t1", name: "tag", color: "" });
    sent.length = 0;

    for (const table of USER_SYNC_TABLES) {
      await myDB.setSyncScope(table, "network", {
        networkId: "net-1",
        includeExisting: true,
      });
    }
    const channels = sent.map((p) => unmarshalSharedRecord(p).channel).sort();
    expect(channels).toEqual(["mydb:net-1:member_tags", "mydb:net-1:users"]);

    // 以後の書き込みも groupshare へ流れ、読み出しは SQL から返る。
    sent.length = 0;
    await repo.saveUser(user("did:key:zb", "Bob"));
    expect(sent.length).toBeGreaterThan(0);
    expect((await repo.listUsers()).map((u) => u.id).sort()).toEqual([
      "did:key:za",
      "did:key:zb",
    ]);
  });

  it("applies an incoming user row from a peer into the local table", async () => {
    const a = await newMyDB(sqlDb);
    const repoA = new LinkSelfUserRepository(a.myDB);
    await repoA.ensureSchema();
    await a.myDB.setSyncScope("users", "network", { networkId: "net-1" });

    const sqlDbB = await SqliteWasmDatabase.open();
    try {
      const b = await newMyDB(sqlDbB);
      const repoB = new LinkSelfUserRepository(b.myDB);
      await repoB.ensureSchema();
      await b.myDB.setSyncScope("users", "network", { networkId: "net-1" });

      await repoA.saveUser(user("did:key:za", "Alice"));
      for (const p of a.sent) {
        await b.layer.handleIncoming(p);
      }
      expect((await repoB.getUser("did:key:za"))?.name).toBe("Alice");

      // 削除も伝播する（SQL DELETE 突き合わせミラー → 墓石 → 反映）。
      a.sent.length = 0;
      await repoA.deleteUser("did:key:za");
      for (const p of a.sent) {
        await b.layer.handleIncoming(p);
      }
      expect(await repoB.getUser("did:key:za")).toBeNull();
    } finally {
      await sqlDbB.close();
    }
  });
});
