// SettingsService の AI 地図取込用 API キー設定のテスト。
// docs/wants/01_共通基盤.md「アプリ設定画面」/ 03_地図機能.md「AI による区域地図作成」参照。

import { beforeEach, describe, expect, it } from "vitest";
import { InMemoryPersonalRepository } from "../data/inmemory/inmemory-personal-repository";
import { PersonalRepositorySettingsAdapter } from "./settings-binding-adapter";
import {
  defaultModelForProvider,
  maskApiKey,
  resolveModel,
  SettingsService,
} from "./settings-service";

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

describe("AI モデル", () => {
  it("未設定時は既定モデル claude-haiku-4-5-20251001 を返す", async () => {
    expect(await svc.getAiModel()).toBe("claude-haiku-4-5-20251001");
  });

  it("保存した値を取り出せる", async () => {
    await svc.setAiModel("claude-opus-4-8");
    expect(await svc.getAiModel()).toBe("claude-opus-4-8");
  });
});

describe("AI API キー（プロバイダ別）", () => {
  it("未設定時は空文字を返す", async () => {
    expect(await svc.getAiApiKey("anthropic")).toBe("");
  });

  it("プロバイダごとに独立して保存・取得できる", async () => {
    await svc.setAiApiKey("anthropic", "sk-ant-abc123");
    await svc.setAiApiKey("gemini", "AIza-xyz789");
    expect(await svc.getAiApiKey("anthropic")).toBe("sk-ant-abc123");
    expect(await svc.getAiApiKey("gemini")).toBe("AIza-xyz789");
  });

  it("一方のプロバイダのキー変更が他方に影響しない", async () => {
    await svc.setAiApiKey("anthropic", "sk-ant-abc123");
    await svc.setAiApiKey("gemini", "AIza-xyz789");
    await svc.setAiApiKey("anthropic", "");
    expect(await svc.getAiApiKey("anthropic")).toBe("");
    expect(await svc.getAiApiKey("gemini")).toBe("AIza-xyz789");
  });
});

describe("モデル解決", () => {
  it("プロバイダの既定モデルは一覧の先頭（低コスト側）", () => {
    expect(defaultModelForProvider("anthropic")).toBe(
      "claude-haiku-4-5-20251001",
    );
    expect(defaultModelForProvider("gemini")).toBe("gemini-3.1-flash-lite");
  });

  it("未知プロバイダは既定プロバイダの既定モデルへ", () => {
    expect(defaultModelForProvider("unknown")).toBe(
      "claude-haiku-4-5-20251001",
    );
  });

  it("プロバイダ不整合なモデルは既定へフォールバックする", () => {
    // gemini に claude モデルが残っていても既定へ寄せる
    expect(resolveModel("gemini", "claude-opus-4-8")).toBe("gemini-3.1-flash-lite");
    // 整合していればそのまま
    expect(resolveModel("anthropic", "claude-opus-4-8")).toBe(
      "claude-opus-4-8",
    );
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
