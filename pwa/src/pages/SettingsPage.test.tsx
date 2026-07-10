// SettingsPage の AI 地図取込セクション（プロバイダ + API キー）テスト。
// docs/wants/01_共通基盤.md「アプリ設定画面」参照。

import { beforeEach, describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { I18nProvider } from "../contexts/I18nContext";
import { IdentityProvider } from "../contexts/IdentityContext";
import {
  type AppServices,
  ServicesProvider,
  createInMemoryServices,
} from "../contexts/ServicesContext";
import type { IdentityService } from "../services/identity-service";
import { setLocale } from "../i18n/i18n-util";
import { SettingsPage } from "./SettingsPage";

// 本番相当（非 dev）の最小 IdentityService。dev セクションは非表示になる。
const fakeIdentityService: IdentityService = {
  getRealDID: async () => "did:test:self",
  getCurrentActor: async () => "did:test:self",
  setCurrentActor: async () => {},
  isDevMode: async () => false,
  listAvailableIdentities: async () => [],
  getUser: async () => null,
};

async function renderSettings(
  seed?: (services: AppServices) => Promise<void>,
): Promise<AppServices> {
  const services = createInMemoryServices();
  await seed?.(services);
  render(
    <I18nProvider>
      <IdentityProvider service={fakeIdentityService}>
        <ServicesProvider services={services}>
          <SettingsPage />
        </ServicesProvider>
      </IdentityProvider>
    </I18nProvider>,
  );
  return services;
}

describe("SettingsPage AI 地図取込", () => {
  beforeEach(() => {
    localStorage.clear();
    setLocale("ja");
  });

  it("未登録時は『未登録』と表示する", async () => {
    await renderSettings();
    expect(await screen.findByText("AI 地図取込")).toBeInTheDocument();
    expect(screen.getByText("未登録")).toBeInTheDocument();
  });

  it("API キーを入力して保存すると個人設定に永続化され、マスク表示される", async () => {
    const services = await renderSettings();
    await screen.findByText("AI 地図取込");

    const input = screen.getByLabelText("API キー");
    await userEvent.type(input, "sk-ant-secret9999");
    await userEvent.click(screen.getByRole("button", { name: "保存" }));

    // 永続化を検証
    expect(await services.settingsService.getAiApiKey("anthropic")).toBe(
      "sk-ant-secret9999",
    );
    // マスク表示（末尾 4 桁のみ露出）
    expect(await screen.findByText(/9999/)).toBeInTheDocument();
    expect(screen.getByText("API キーを保存しました")).toBeInTheDocument();
    // 生キーは画面に出さない
    expect(screen.queryByText(/sk-ant-secret9999/)).not.toBeInTheDocument();
  });

  it("モデルを選んで保存すると個人設定に永続化される", async () => {
    const services = await renderSettings();
    await screen.findByText("AI 地図取込");

    await userEvent.selectOptions(
      screen.getByLabelText("モデル"),
      "claude-haiku-4-5-20251001",
    );
    await userEvent.click(screen.getByRole("button", { name: "保存" }));

    expect(await services.settingsService.getAiModel()).toBe(
      "claude-haiku-4-5-20251001",
    );
  });

  it("登録済みキーを削除できる", async () => {
    const services = await renderSettings(async (s) => {
      await s.settingsService.setAiApiKey("anthropic", "sk-ant-todelete1234");
    });
    await screen.findByText(/1234/);

    await userEvent.click(screen.getByRole("button", { name: "削除" }));

    expect(await services.settingsService.getAiApiKey("anthropic")).toBe("");
    expect(await screen.findByText("未登録")).toBeInTheDocument();
  });
});
