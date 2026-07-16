// LocalStoragePersonalRepository の永続化テスト。
// 別インスタンス（＝再読み込み相当）で設定が保持されることを検証する。

import { beforeEach, describe, expect, it } from "vitest";
import { LocalStoragePersonalRepository } from "./localstorage-personal-repository";

beforeEach(() => {
  localStorage.clear();
});

describe("LocalStoragePersonalRepository", () => {
  it("言語・区域詳細半径・非表示 tip が保持される", async () => {
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
    expect(await r.getLocale()).toBe("");
    expect(await r.getHiddenTipKeys()).toEqual([]);
  });

  it("壊れた JSON が保存されていても空設定で復帰する", async () => {
    localStorage.setItem("hvs.personal-settings.v1", "{ broken");
    const r = new LocalStoragePersonalRepository();
    expect(await r.getLocale()).toBe("");
  });

  it("廃止済みの旧 AI 設定（平文 API キー含む）は読み込み時に破棄する", async () => {
    localStorage.setItem(
      "hvs.personal-settings.v1",
      JSON.stringify({
        locale: "ja",
        aiProvider: "gemini",
        aiApiKeys: { anthropic: "sk-ant-secret" },
        aiMapImportConsent: true,
      }),
    );
    const r = new LocalStoragePersonalRepository();
    expect(await r.getLocale()).toBe("ja");
    const raw = localStorage.getItem("hvs.personal-settings.v1")!;
    expect(raw).not.toContain("aiApiKeys");
    expect(raw).not.toContain("sk-ant-secret");
    expect(raw).not.toContain("aiProvider");
  });
});
