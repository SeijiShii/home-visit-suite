// LocalStoragePersonalRepository の永続化テスト。
// 別インスタンス（＝再読み込み相当）で設定が保持されることを検証する。

import { beforeEach, describe, expect, it } from "vitest";
import { LocalStoragePersonalRepository } from "./localstorage-personal-repository";

beforeEach(() => {
  localStorage.clear();
});

describe("LocalStoragePersonalRepository", () => {
  it("AI 設定は別インスタンス（再読み込み相当）でも保持される", async () => {
    const a = new LocalStoragePersonalRepository();
    await a.setAiProvider("gemini");
    await a.setAiModel("gemini-3.1-flash-lite");
    await a.setAiApiKey("gemini", "AIza-persist");
    await a.setAiApiKey("anthropic", "sk-ant-persist");
    await a.setAiMapImportConsent(true);

    const b = new LocalStoragePersonalRepository();
    expect(await b.getAiProvider()).toBe("gemini");
    expect(await b.getAiModel()).toBe("gemini-3.1-flash-lite");
    expect(await b.getAiApiKey("gemini")).toBe("AIza-persist");
    expect(await b.getAiApiKey("anthropic")).toBe("sk-ant-persist");
    expect(await b.getAiMapImportConsent()).toBe(true);
  });

  it("言語・区域詳細半径・非表示 tip も保持される", async () => {
    const a = new LocalStoragePersonalRepository();
    await a.setLocale("en");
    await a.setAreaDetailRadiusKm(3);
    await a.addHiddenTipKey("map.intro");

    const b = new LocalStoragePersonalRepository();
    expect(await b.getLocale()).toBe("en");
    expect(await b.getAreaDetailRadiusKm()).toBe(3);
    expect(await b.getHiddenTipKeys()).toEqual(["map.intro"]);
  });

  it("未設定時は空値を返す", async () => {
    const r = new LocalStoragePersonalRepository();
    expect(await r.getAiApiKey("anthropic")).toBe("");
    expect(await r.getAiProvider()).toBe("");
    expect(await r.getHiddenTipKeys()).toEqual([]);
  });

  it("壊れた JSON が保存されていても空設定で復帰する", async () => {
    localStorage.setItem("hvs.personal-settings.v1", "{ broken");
    const r = new LocalStoragePersonalRepository();
    expect(await r.getAiProvider()).toBe("");
  });
});
