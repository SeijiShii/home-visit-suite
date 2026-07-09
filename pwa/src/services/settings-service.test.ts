// SettingsService の AI 地図取込用 API キー設定のテスト。
// docs/wants/01_共通基盤.md「アプリ設定画面」/ 03_地図機能.md「AI による区域地図作成」参照。

import { beforeEach, describe, expect, it } from "vitest";
import { InMemoryPersonalRepository } from "../data/inmemory/inmemory-personal-repository";
import { PersonalRepositorySettingsAdapter } from "./settings-binding-adapter";
import { maskApiKey, SettingsService } from "./settings-service";

let repo: InMemoryPersonalRepository;
let svc: SettingsService;

beforeEach(() => {
  repo = new InMemoryPersonalRepository();
  svc = new SettingsService(new PersonalRepositorySettingsAdapter(repo));
});

describe("AI プロバイダ", () => {
  it("未設定時は既定の 'anthropic' を返す", async () => {
    expect(await svc.getAiProvider()).toBe("anthropic");
  });

  it("保存した値を取り出せる", async () => {
    await svc.setAiProvider("openai");
    expect(await svc.getAiProvider()).toBe("openai");
  });
});

describe("AI API キー", () => {
  it("未設定時は空文字を返す", async () => {
    expect(await svc.getAiApiKey()).toBe("");
  });

  it("保存した値を取り出せる", async () => {
    await svc.setAiApiKey("sk-ant-abc123");
    expect(await svc.getAiApiKey()).toBe("sk-ant-abc123");
  });
});

describe("maskApiKey", () => {
  it("末尾 4 文字のみ残しマスクする", () => {
    expect(maskApiKey("sk-ant-abcd1234")).toBe("•••••••••••1234");
  });

  it("空文字は空文字のまま", () => {
    expect(maskApiKey("")).toBe("");
  });

  it("4 文字以下は全マスク（末尾を露出しない）", () => {
    expect(maskApiKey("abcd")).toBe("••••");
    expect(maskApiKey("ab")).toBe("••");
  });
});
