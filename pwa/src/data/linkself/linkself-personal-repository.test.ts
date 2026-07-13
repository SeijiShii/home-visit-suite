// LinkSelfPersonalRepository の設定 KV 永続を検証する。
// 実 MyDB（MemDeviceStorage 上の in-memory）に対して読み書きし、同一ストレージ上に
// 別リポジトリを作り直しても値が残る（＝リポジトリではなくストア側に永続している）
// ことを確認する。OPFS 実永続・端末間同期は実ブラウザ / daemon 越しで別途確認する。
import {
  MemDeviceStorage,
  MyDB,
  ReplicationEngine,
  type DeviceStorage,
} from "@linkself/core";
import { beforeEach, describe, expect, it } from "vitest";
import { LinkSelfPersonalRepository } from "./linkself-personal-repository";

function newMyDB(storage: DeviceStorage): MyDB {
  const engine = new ReplicationEngine({
    storage,
    selfDID: "did:key:ztestselfdid",
    peers: async () => [],
    send: async () => {},
  });
  return new MyDB(engine, null); // KV のみ（SQL バックエンドなし）
}

describe("LinkSelfPersonalRepository (settings via MyDB KV)", () => {
  let storage: DeviceStorage;
  let repo: LinkSelfPersonalRepository;

  beforeEach(() => {
    storage = new MemDeviceStorage();
    repo = new LinkSelfPersonalRepository(newMyDB(storage));
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

  it("persists across a fresh repository over the same storage", async () => {
    await repo.setLocale("en");
    await repo.setAiApiKey("anthropic", "sk-persist");
    await repo.addHiddenTipKey("tip.persist");

    // 同一ストレージ上に別インスタンスを作り直す（"リロード" 相当）。
    const repo2 = new LinkSelfPersonalRepository(newMyDB(storage));
    expect(await repo2.getLocale()).toBe("en");
    expect(await repo2.getAiApiKey("anthropic")).toBe("sk-persist");
    expect(await repo2.getHiddenTipKeys()).toEqual(["tip.persist"]);
  });
});
