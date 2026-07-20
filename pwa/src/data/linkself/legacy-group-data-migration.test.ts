// @vitest-environment node
// 旧 localStorage（PersistentMap / LocalStorageMapBinding）→ MyDB SQL の一度きり移行を検証する。
// node 環境のため localStorage は簡易スタブを与える。
import {
  MemDeviceStorage,
  MyDB,
  ReplicationEngine,
  SqlProxy,
  SqliteWasmDatabase,
  wireSqlSync,
} from "@linkself/core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { migrateLegacyGroupData } from "./legacy-group-data-migration";
import { LinkSelfNotificationRepository } from "./linkself-notification-repository";
import { LinkSelfRegionRepository } from "./linkself-region-repository";
import { LinkSelfMapBinding } from "./linkself-map-binding";

function stubLocalStorage(): Storage {
  const store = new Map<string, string>();
  return {
    get length() {
      return store.size;
    },
    clear: () => store.clear(),
    getItem: (k: string) => store.get(k) ?? null,
    key: (i: number) => [...store.keys()][i] ?? null,
    removeItem: (k: string) => void store.delete(k),
    setItem: (k: string, v: string) => void store.set(k, v),
  } as Storage;
}

async function newMyDB(sqlDb: SqliteWasmDatabase): Promise<MyDB> {
  const engine = new ReplicationEngine({
    storage: new MemDeviceStorage(),
    selfDID: "did:key:ztestselfdid",
    peers: async () => [],
    send: async () => {},
  });
  const proxy = await SqlProxy.open(sqlDb);
  const myDB = new MyDB(engine, proxy);
  wireSqlSync(proxy, myDB);
  return myDB;
}

const PREFIX = "hvs.g.test";

describe("migrateLegacyGroupData", () => {
  let sqlDb: SqliteWasmDatabase;
  const originalLocalStorage = (globalThis as { localStorage?: Storage })
    .localStorage;

  beforeEach(async () => {
    sqlDb = await SqliteWasmDatabase.open(); // in-memory
    (globalThis as { localStorage?: Storage }).localStorage =
      stubLocalStorage();
  });

  afterEach(async () => {
    await sqlDb.close();
    (globalThis as { localStorage?: Storage }).localStorage =
      originalLocalStorage;
  });

  it("copies legacy PersistentMap entries into empty SQL tables once", async () => {
    // PersistentMap 形式（[key, value][]）で旧データを置く。
    localStorage.setItem(
      `${PREFIX}:region:regions`,
      JSON.stringify([
        ["NRT", { id: "NRT", name: "成田", deletedAt: null }],
      ]),
    );
    localStorage.setItem(
      `${PREFIX}:region:areas`,
      JSON.stringify([
        ["NRT-001-01", { id: "NRT-001-01", parentAreaId: "NRT-001", deletedAt: null }],
      ]),
    );

    const myDB = await newMyDB(sqlDb);
    await migrateLegacyGroupData(myDB, PREFIX);

    const repo = new LinkSelfRegionRepository(myDB);
    expect((await repo.listRegions()).map((r) => r.id)).toEqual(["NRT"]);
    expect((await repo.listAreas("NRT-001")).map((a) => a.id)).toEqual([
      "NRT-001-01",
    ]);

    // SQL 側が非空になったため、旧データを書き換えても再移行されない。
    localStorage.setItem(
      `${PREFIX}:region:regions`,
      JSON.stringify([["HND", { id: "HND", name: "羽田", deletedAt: null }]]),
    );
    await migrateLegacyGroupData(myDB, PREFIX);
    expect((await repo.listRegions()).map((r) => r.id)).toEqual(["NRT"]);
  });

  // 回帰: feedback は SQL テーブルもリポジトリもあるのに移行対象から漏れており、
  // 旧実装で送受信したフィードバックが移行時に無言で消えていた。
  it("migrates legacy feedback rows", async () => {
    localStorage.setItem(
      `${PREFIX}:notification:feedback`,
      JSON.stringify([
        [
          "fb-1",
          {
            id: "fb-1",
            kind: "bug_report",
            body: "部屋の並び順が入れ替わる",
            senderId: "did:example:member",
            createdAt: "2026-07-11T02:00:00.000Z",
            status: "pending",
            resolvedAt: null,
            resolvedBy: "",
          },
        ],
      ]),
    );

    const myDB = await newMyDB(sqlDb);
    await migrateLegacyGroupData(myDB, PREFIX);

    const repo = new LinkSelfNotificationRepository(myDB);
    const rows = await repo.listFeedback();
    expect(rows.map((f) => f.id)).toEqual(["fb-1"]);
    expect(rows[0].body).toBe("部屋の並び順が入れ替わる");
  });

  it("splits the legacy map network blob into entity rows", async () => {
    localStorage.setItem(
      `${PREFIX}:map.network`,
      JSON.stringify({
        vertices: [{ id: "v1", lat: 35, lng: 140 }],
        edges: [{ id: "e1", v1: "v1", v2: "v1" }],
        polygons: [{ id: "p1", edgeIds: ["e1"], holes: [], vertexIds: ["v1"] }],
      }),
    );

    const myDB = await newMyDB(sqlDb);
    await migrateLegacyGroupData(myDB, PREFIX);

    const binding = new LinkSelfMapBinding(myDB);
    const network = JSON.parse(await binding.GetNetworkJSON());
    expect(network.vertices).toEqual([{ id: "v1", lat: 35, lng: 140 }]);
    expect(network.edges).toEqual([{ id: "e1", v1: "v1", v2: "v1" }]);
    expect(network.polygons).toHaveLength(1);
  });

  it("does nothing without a storage prefix (test/in-memory mode)", async () => {
    const myDB = await newMyDB(sqlDb);
    await migrateLegacyGroupData(myDB, undefined);
    const repo = new LinkSelfRegionRepository(myDB);
    expect(await repo.listRegions()).toEqual([]);
  });
});
