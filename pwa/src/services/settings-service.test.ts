// SettingsService の設定テスト。
// docs/wants/01_共通基盤.md「アプリ設定画面」参照。

import { beforeEach, describe, expect, it } from "vitest";
import { InMemoryPersonalRepository } from "../data/inmemory/inmemory-personal-repository";
import { PersonalRepositorySettingsAdapter } from "./settings-binding-adapter";
import { SettingsService } from "./settings-service";

let repo: InMemoryPersonalRepository;
let svc: SettingsService;

beforeEach(() => {
  repo = new InMemoryPersonalRepository();
  svc = new SettingsService(new PersonalRepositorySettingsAdapter(repo));
});

describe("区域詳細編集の隣接半径", () => {
  it("未設定時（リポジトリが 0 を返す）は既定の 2.5 km を返す", async () => {
    expect(await svc.getAreaDetailRadiusKm()).toBe(2.5);
  });

  it("保存した値を取り出せる", async () => {
    await svc.setAreaDetailRadiusKm(4);
    expect(await svc.getAreaDetailRadiusKm()).toBe(4);
  });

  it("不正値（負数）が保存されていても既定値へフォールバックする", async () => {
    await svc.setAreaDetailRadiusKm(-1);
    expect(await svc.getAreaDetailRadiusKm()).toBe(2.5);
  });
});
