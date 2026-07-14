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
    expect(await repo.getAiProvider()).toBe("");
    expect(await repo.getAiApiKey("openai")).toBe("");
    expect(await repo.getAiModel()).toBe("");
    expect(await repo.getAiMapImportConsent()).toBe(false);
    expect(await repo.getHiddenTipKeys()).toEqual([]);
  });

  it("round-trips all scalar settings", async () => {
    await repo.setLocale("ja");
    await repo.setAreaDetailRadiusKm(1.5);
    await repo.setAiProvider("anthropic");
    await repo.setAiModel("claude-opus-4-8");
    await repo.setAiMapImportConsent(true);

    expect(await repo.getLocale()).toBe("ja");
    expect(await repo.getAreaDetailRadiusKm()).toBe(1.5);
    expect(await repo.getAiProvider()).toBe("anthropic");
    expect(await repo.getAiModel()).toBe("claude-opus-4-8");
    expect(await repo.getAiMapImportConsent()).toBe(true);
  });

  it("keeps API keys isolated per provider", async () => {
    await repo.setAiApiKey("openai", "sk-openai");
    await repo.setAiApiKey("anthropic", "sk-anthropic");
    expect(await repo.getAiApiKey("openai")).toBe("sk-openai");
    expect(await repo.getAiApiKey("anthropic")).toBe("sk-anthropic");
    expect(await repo.getAiApiKey("google")).toBe("");
  });

  it("manages hidden tip keys (add is idempotent, clear empties)", async () => {
    await repo.addHiddenTipKey("tip.a");
    await repo.addHiddenTipKey("tip.b");
    await repo.addHiddenTipKey("tip.a"); // idempotent
    expect((await repo.getHiddenTipKeys()).sort()).toEqual(["tip.a", "tip.b"]);

    await repo.clearHiddenTipKeys();
    expect(await repo.getHiddenTipKeys()).toEqual([]);
  });

  it("persists across a fresh repository over the same SQL store", async () => {
    await repo.setLocale("en");
    await repo.setAiApiKey("anthropic", "sk-persist");
    await repo.addHiddenTipKey("tip.persist");

    // 同一 SQL DB 上に別 MyDB / 別リポジトリを作り直す（"リロード" 相当）。
    const repo2 = new LinkSelfPersonalRepository(
      await newMyDB(sqlDb, new MemDeviceStorage()),
    );
    expect(await repo2.getLocale()).toBe("en");
    expect(await repo2.getAiApiKey("anthropic")).toBe("sk-persist");
    expect(await repo2.getHiddenTipKeys()).toEqual(["tip.persist"]);
  });
});
