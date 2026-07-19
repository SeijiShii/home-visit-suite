// @vitest-environment node
// LinkSelfMapBinding（map_vertices/map_edges/map_polygons = MyDB SQL の JSON 行）を検証する。
// ネットワーク JSON の往復と、保存時の差分書き込み（変更行だけ upsert・消えた行だけ
// delete = 全行再配送による他端末上書きの防止）を確認する。
import {
  MemDeviceStorage,
  MyDB,
  ReplicationEngine,
  SqlProxy,
  SqliteWasmDatabase,
  wireSqlSync,
} from "@linkself/core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { LinkSelfMapBinding } from "./linkself-map-binding";

async function newMyDB(sqlDb: SqliteWasmDatabase): Promise<{
  myDB: MyDB;
  writes: string[];
}> {
  const engine = new ReplicationEngine({
    storage: new MemDeviceStorage(),
    selfDID: "did:key:ztestselfdid",
    peers: async () => [],
    send: async () => {},
  });
  const proxy = await SqlProxy.open(sqlDb);
  const writes: string[] = [];
  proxy.onWrite = (e) => {
    writes.push(e.sql);
  };
  const myDB = new MyDB(engine, proxy);
  wireSqlSync(proxy, myDB);
  return { myDB, writes };
}

const NETWORK = {
  vertices: [
    { id: "v1", lat: 35.0, lng: 140.0 },
    { id: "v2", lat: 35.1, lng: 140.1 },
  ],
  edges: [{ id: "e1", v1: "v1", v2: "v2" }],
  polygons: [{ id: "p1", edgeIds: ["e1"], holes: [], vertexIds: ["v1", "v2"] }],
};

describe("LinkSelfMapBinding (map_* via MyDB SQL)", () => {
  let sqlDb: SqliteWasmDatabase;

  beforeEach(async () => {
    sqlDb = await SqliteWasmDatabase.open(); // in-memory
  });

  afterEach(async () => {
    await sqlDb.close();
  });

  it("returns an empty network when nothing is stored", async () => {
    const { myDB } = await newMyDB(sqlDb);
    const binding = new LinkSelfMapBinding(myDB);
    expect(JSON.parse(await binding.GetNetworkJSON())).toEqual({
      vertices: [],
      edges: [],
      polygons: [],
    });
  });

  it("round-trips a network JSON", async () => {
    const { myDB } = await newMyDB(sqlDb);
    const binding = new LinkSelfMapBinding(myDB);
    await binding.SaveNetworkJSON(JSON.stringify(NETWORK));
    const loaded = JSON.parse(await binding.GetNetworkJSON());
    expect(loaded.vertices).toEqual(expect.arrayContaining(NETWORK.vertices));
    expect(loaded.edges).toEqual(NETWORK.edges);
    expect(loaded.polygons).toEqual(NETWORK.polygons);
  });

  it("writes only the diff on re-save (unchanged rows are not rewritten)", async () => {
    const { myDB, writes } = await newMyDB(sqlDb);
    const binding = new LinkSelfMapBinding(myDB);
    await binding.SaveNetworkJSON(JSON.stringify(NETWORK));

    writes.length = 0;
    // v2 を動かし、e1/p1/v1 は不変のまま保存する。
    const next = {
      ...NETWORK,
      vertices: [NETWORK.vertices[0]!, { id: "v2", lat: 35.2, lng: 140.2 }],
    };
    await binding.SaveNetworkJSON(JSON.stringify(next));
    const domainWrites = writes.filter((w) => w.includes("map_"));
    expect(domainWrites).toHaveLength(1);
    expect(domainWrites[0]).toContain("map_vertices");
  });

  it("does not delete rows the editor never saw (incoming sync rows survive a stale save)", async () => {
    const { myDB } = await newMyDB(sqlDb);
    const binding = new LinkSelfMapBinding(myDB);
    await binding.SaveNetworkJSON(JSON.stringify(NETWORK));
    await binding.GetNetworkJSON(); // エディタが loadAll した状態

    // ScopeNetwork 受信相当: エディタの知らない行が SQL に届く。
    await myDB.exec(
      "INSERT OR REPLACE INTO map_vertices (id, data) VALUES (?, ?)",
      ["v9", JSON.stringify({ id: "v9", lat: 36, lng: 141 })],
    );

    // 受信前のスナップショット（v9 を含まない）で保存しても v9 は消えない。
    await binding.SaveNetworkJSON(JSON.stringify(NETWORK));
    const loaded = JSON.parse(await binding.GetNetworkJSON());
    expect(loaded.vertices.map((v: { id: string }) => v.id).sort()).toEqual([
      "v1",
      "v2",
      "v9",
    ]);
  });

  it("MarkNotServed: サニタイズ除外行は保存で削除されない（除外だけの行の墓石化防止）", async () => {
    const { myDB } = await newMyDB(sqlDb);
    const binding = new LinkSelfMapBinding(myDB);
    await binding.SaveNetworkJSON(JSON.stringify(NETWORK));
    await binding.GetNetworkJSON(); // servedIds = {v1,v2,e1,p1}
    // アダプタが e1/p1 をサニタイズ除外（頂点欠け等）としてエディタに渡さず、
    // その旨を通知した状況を再現する。
    binding.MarkNotServed({ edges: ["e1"], polygons: ["p1"] });

    // エディタは e1/p1 を知らないので保存スナップショットに含めない。
    await binding.SaveNetworkJSON(
      JSON.stringify({ vertices: NETWORK.vertices, edges: [], polygons: [] }),
    );
    const loaded = JSON.parse(await binding.GetNetworkJSON());
    // 除外しただけの e1/p1 は削除されず DB に残る。
    expect(loaded.edges.map((e: { id: string }) => e.id)).toEqual(["e1"]);
    expect(loaded.polygons.map((p: { id: string }) => p.id)).toEqual(["p1"]);
  });

  it("MarkNotServed: 除外行の墓石が届いたら保存で復活しない（resurrection なし）", async () => {
    const { myDB } = await newMyDB(sqlDb);
    const binding = new LinkSelfMapBinding(myDB);
    await binding.SaveNetworkJSON(JSON.stringify(NETWORK));
    await binding.GetNetworkJSON();
    binding.MarkNotServed({ edges: ["e1"], polygons: ["p1"] });

    // 別端末が e1 を正当に削除した墓石が届く（SQL から消える）。
    await myDB.exec("DELETE FROM map_edges WHERE id = ?", ["e1"]);

    // エディタが e1 を含まないスナップショットで保存しても e1 は復活しない。
    await binding.SaveNetworkJSON(
      JSON.stringify({ vertices: NETWORK.vertices, edges: [], polygons: [] }),
    );
    const loaded = JSON.parse(await binding.GetNetworkJSON());
    expect(loaded.edges).toEqual([]);
  });

  it("deletes rows that disappeared from the saved network", async () => {
    const { myDB } = await newMyDB(sqlDb);
    const binding = new LinkSelfMapBinding(myDB);
    await binding.SaveNetworkJSON(JSON.stringify(NETWORK));
    await binding.SaveNetworkJSON(
      JSON.stringify({
        vertices: [NETWORK.vertices[0]],
        edges: [],
        polygons: [],
      }),
    );
    const loaded = JSON.parse(await binding.GetNetworkJSON());
    expect(loaded.vertices).toEqual([NETWORK.vertices[0]]);
    expect(loaded.edges).toEqual([]);
    expect(loaded.polygons).toEqual([]);
  });
});
