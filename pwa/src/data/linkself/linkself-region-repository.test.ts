// @vitest-environment node
// LinkSelfRegionRepository（regions/parent_areas/areas = MyDB SQL の JSON 行）を検証する。
// 実 MyDB（SqliteWasmDatabase in-memory + SqlProxy + wireSqlSync）で読み書きし、
// 論理削除の見え方（list/get は除外・getRaw は含む）と、ScopeNetwork 昇格時の
// 既存データ配送・受信適用（別ピアの区域が届く = スマホ側に区域一覧が出る経路）を確認する。
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
import type { Area, Region } from "../../domain/models/region";
import { GROUP_SYNC_TABLES } from "./group-schema";
import { LinkSelfRegionRepository } from "./linkself-region-repository";

function region(id: string, name: string): Region {
  return { id, name, symbol: id, deletedAt: null } as unknown as Region;
}

function area(id: string, parentAreaId: string): Area {
  return { id, parentAreaId, deletedAt: null } as unknown as Area;
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

describe("LinkSelfRegionRepository (regions/parent_areas/areas via MyDB SQL)", () => {
  let sqlDb: SqliteWasmDatabase;

  beforeEach(async () => {
    sqlDb = await SqliteWasmDatabase.open(); // in-memory
  });

  afterEach(async () => {
    await sqlDb.close();
  });

  it("saves and lists regions; soft delete hides from list/get but not getRaw", async () => {
    const { myDB } = await newMyDB(sqlDb);
    const repo = new LinkSelfRegionRepository(myDB);

    await repo.saveRegion(region("NRT", "成田"));
    await repo.saveRegion(region("HND", "羽田"));
    expect((await repo.listRegions()).map((r) => r.id).sort()).toEqual([
      "HND",
      "NRT",
    ]);

    await repo.deleteRegion("HND");
    expect((await repo.listRegions()).map((r) => r.id)).toEqual(["NRT"]);
    expect(await repo.getRegion("HND")).toBeNull();
    expect((await repo.getRegionRaw("HND"))?.deletedAt).toBeTruthy();

    await repo.removeRegion("HND");
    expect(await repo.getRegionRaw("HND")).toBeNull();
  });

  it("filters areas by parentAreaId", async () => {
    const { myDB } = await newMyDB(sqlDb);
    const repo = new LinkSelfRegionRepository(myDB);
    await repo.saveArea(area("NRT-001-01", "NRT-001"));
    await repo.saveArea(area("NRT-001-02", "NRT-001"));
    await repo.saveArea(area("NRT-002-01", "NRT-002"));
    expect((await repo.listAreas("NRT-001")).map((a) => a.id).sort()).toEqual([
      "NRT-001-01",
      "NRT-001-02",
    ]);
  });

  it("persists across repository instances (SQL store holds data)", async () => {
    const { myDB } = await newMyDB(sqlDb);
    await new LinkSelfRegionRepository(myDB).saveRegion(region("NRT", "成田"));
    const again = new LinkSelfRegionRepository(myDB);
    expect((await again.listRegions()).map((r) => r.id)).toEqual(["NRT"]);
  });

  it("promotes regions to ScopeNetwork and broadcasts existing data", async () => {
    const { myDB, sent } = await newMyDB(sqlDb);
    const repo = new LinkSelfRegionRepository(myDB);
    await repo.saveRegion(region("NRT", "成田"));
    sent.length = 0;

    await myDB.setSyncScope("regions", "network", {
      networkId: "net-1",
      includeExisting: true,
    });
    const channels = sent.map((p) => unmarshalSharedRecord(p).channel);
    expect(channels).toEqual(["mydb:net-1:regions"]);
  });

  it("applies an incoming region/area from a peer (paired phone receives areas)", async () => {
    const a = await newMyDB(sqlDb);
    const repoA = new LinkSelfRegionRepository(a.myDB);
    await repoA.saveRegion(region("x", "warmup")); // スキーマ適用
    await repoA.removeRegion("x");
    await a.myDB.setSyncScope("regions", "network", { networkId: "net-1" });
    await a.myDB.setSyncScope("areas", "network", { networkId: "net-1" });

    const sqlDbB = await SqliteWasmDatabase.open();
    try {
      const b = await newMyDB(sqlDbB);
      const repoB = new LinkSelfRegionRepository(b.myDB);
      await repoB.saveRegion(region("y", "warmup"));
      await repoB.removeRegion("y");
      await b.myDB.setSyncScope("regions", "network", { networkId: "net-1" });
      await b.myDB.setSyncScope("areas", "network", { networkId: "net-1" });

      await repoA.saveRegion(region("NRT", "成田"));
      await repoA.saveArea(area("NRT-001-01", "NRT-001"));
      for (const p of a.sent) {
        await b.layer.handleIncoming(p);
      }
      expect((await repoB.listRegions()).map((r) => r.id)).toEqual(["NRT"]);
      expect((await repoB.listAreas("NRT-001")).map((x) => x.id)).toEqual([
        "NRT-001-01",
      ]);
    } finally {
      await sqlDbB.close();
    }
  });

  it("GROUP_SYNC_TABLES covers users and all group domain tables", () => {
    for (const t of [
      "users",
      "member_tags",
      "regions",
      "parent_areas",
      "areas",
      "places",
      "checkouts",
      "checkout_invitations",
      "visit_records",
      "visit_record_edits",
      "coverages",
      "notifications",
      "requests",
      "audit_log",
      "map_vertices",
      "map_edges",
      "map_polygons",
    ]) {
      expect(GROUP_SYNC_TABLES).toContain(t);
    }
  });
});
