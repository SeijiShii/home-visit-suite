// @vitest-environment node
// LinkSelfPersonalRepository の設定永続（SQL 面）を検証する。
// 実 MyDB（SqliteWasmDatabase in-memory + SqlProxy + wireSqlSync）に対して読み書きし、
// 同一 SQL DB 上に別リポジトリ／別 MyDB を作り直しても値が残る（＝リポジトリではなく
// SQL ストア側に永続している）ことを確認する。
// OPFS 実永続・端末間同期は実ブラウザ / daemon 越しで別途確認する。
// node env: SqliteWasmDatabase の in-memory（メインスレッド oo1）は node で動く
// （link-self の test/sqlite.test.ts と同条件。Worker/OPFS 版は実ブラウザ専用）。
import {
  MemDeviceStorage,
  MyDB,
  ReplicationEngine,
  SqlProxy,
  SqliteWasmDatabase,
  wireSqlSync,
  type DeviceStorage,
  type SqlDatabase,
} from "@linkself/core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { LinkSelfPersonalRepository } from "./linkself-personal-repository";

// 共有 SQL DB の上に MyDB（KV=devicesync + SQL）を組む。SQL 書き込みは
// wireSqlSync 経由で devicesync にミラーされる（本番配線と同じ）。
async function newMyDB(
  sqlDb: SqlDatabase,
  storage: DeviceStorage,
): Promise<MyDB> {
  const engine = new ReplicationEngine({
    storage,
    selfDID: "did:key:ztestselfdid",
    peers: async () => [],
    send: async () => {},
  });
  const proxy = await SqlProxy.open(sqlDb);
  const myDB = new MyDB(engine, proxy);
  wireSqlSync(proxy, myDB);
  return myDB;
}

describe("LinkSelfPersonalRepository (settings via MyDB SQL)", () => {
  let sqlDb: SqliteWasmDatabase;
  let repo: LinkSelfPersonalRepository;

  beforeEach(async () => {
    sqlDb = await SqliteWasmDatabase.open(); // in-memory
    repo = new LinkSelfPersonalRepository(
      await newMyDB(sqlDb, new MemDeviceStorage()),
    );
  });

  afterEach(async () => {
    await sqlDb.close();
  });

  it("returns empty/zero defaults before anything is set", async () => {
    expect(await repo.getLocale()).toBe("");
    expect(await repo.getAreaDetailRadiusKm()).toBe(0);
    expect(await repo.getHiddenTipKeys()).toEqual([]);
  });

  it("round-trips all scalar settings", async () => {
    await repo.setLocale("ja");
    await repo.setAreaDetailRadiusKm(1.5);

    expect(await repo.getLocale()).toBe("ja");
    expect(await repo.getAreaDetailRadiusKm()).toBe(1.5);
  });

  it("manages hidden tip keys (add is idempotent, clear empties)", async () => {
    await repo.addHiddenTipKey("tip.a");
    await repo.addHiddenTipKey("tip.b");
    await repo.addHiddenTipKey("tip.a"); // idempotent
    expect((await repo.getHiddenTipKeys()).sort()).toEqual(["tip.a", "tip.b"]);

    await repo.clearHiddenTipKeys();
    expect(await repo.getHiddenTipKeys()).toEqual([]);
  });

  it("purges obsolete AI settings rows (incl. plaintext API keys) on first access", async () => {
    // migrate 済みストアに旧 AI 設定行を直接差し込み、新しいリポジトリの
    // 初回アクセスで破棄されることを確認する（AI 地図取込の廃止 2026-07-16）。
    await repo.setLocale("ja"); // migrate を走らせる
    const myDB2 = await newMyDB(sqlDb, new MemDeviceStorage());
    await myDB2.exec(
      "INSERT OR REPLACE INTO my_settings (key, value) VALUES ('aiApiKey/anthropic','sk-ant-secret'), ('aiProvider','anthropic'), ('aiMapImportConsent','true')",
    );
    const repo2 = new LinkSelfPersonalRepository(myDB2);
    await repo2.getLocale(); // 初回アクセスで掃除が走る
    const rows = await myDB2.query(
      "SELECT key FROM my_settings WHERE key LIKE 'ai%'",
    );
    expect(rows).toEqual([]);
  });

  it("persists across a fresh repository over the same SQL store", async () => {
    await repo.setLocale("en");
    await repo.addHiddenTipKey("tip.persist");

    // 同一 SQL DB 上に別 MyDB / 別リポジトリを作り直す（"リロード" 相当）。
    const repo2 = new LinkSelfPersonalRepository(
      await newMyDB(sqlDb, new MemDeviceStorage()),
    );
    expect(await repo2.getLocale()).toBe("en");
    expect(await repo2.getHiddenTipKeys()).toEqual(["tip.persist"]);
  });
});
