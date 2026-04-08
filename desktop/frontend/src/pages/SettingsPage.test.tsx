import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { SettingsPage } from "./SettingsPage";
import { I18nProvider } from "../contexts/I18nContext";
import { TipsProvider } from "../contexts/TipsContext";
import { SettingsService, type SettingsBindingAPI } from "../services/settings-service";
import { setLocale as resetI18nLocale } from "../i18n/i18n-util";

function createMockApi(): SettingsBindingAPI {
  return {
    GetHiddenTipKeys: vi.fn(async () => [] as string[]),
    SetTipHidden: vi.fn(async () => {}),
    ResetHiddenTips: vi.fn(async () => {}),
    GetLocale: vi.fn(async () => ""),
    SetLocale: vi.fn(async () => {}),
  };
}

function renderPage(api: SettingsBindingAPI) {
  const service = new SettingsService(api);
  return render(
    <MemoryRouter>
      <I18nProvider service={service}>
        <TipsProvider service={service}>
          <SettingsPage />
        </TipsProvider>
      </I18nProvider>
    </MemoryRouter>,
  );
}

describe("SettingsPage", () => {
  afterEach(() => {
    resetI18nLocale("ja");
    try {
      localStorage.clear();
    } catch {
      // ignore
    }
  });

  it("「ヘルプ表示をリセット」クリックで ResetHiddenTips が呼ばれる", async () => {
    const api = createMockApi();
    const user = userEvent.setup();
    renderPage(api);
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    await user.click(screen.getByRole("button", { name: "ヘルプ表示をリセット" }));
    expect(api.ResetHiddenTips).toHaveBeenCalled();
    expect(screen.getByRole("status").textContent).toContain("リセット");
  });

  it("言語切替で SetLocale が呼ばれ、UI テキストが切り替わる", async () => {
    const api = createMockApi();
    const user = userEvent.setup();
    renderPage(api);
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    // 初期は ja
    expect(screen.getByRole("heading", { name: "設定" })).toBeTruthy();

    await user.click(screen.getByRole("radio", { name: "English" }));
    expect(api.SetLocale).toHaveBeenCalledWith("en");
    // i18n 切替後は en タイトル
    expect(screen.getByRole("heading", { name: "Settings" })).toBeTruthy();
  });
});
