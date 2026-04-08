import { describe, it, expect, vi } from "vitest";
import { render, screen, act } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { TipsProvider, useTips } from "../contexts/TipsContext";
import { TipStack } from "./TipStack";
import { I18nProvider } from "../contexts/I18nContext";
import {
  SettingsService,
  type SettingsBindingAPI,
} from "../services/settings-service";

function createMockApi(initialHidden: string[] = []): SettingsBindingAPI {
  const hidden = new Set(initialHidden);
  return {
    GetHiddenTipKeys: vi.fn(async () => Array.from(hidden)),
    SetTipHidden: vi.fn(async (key: string, h: boolean) => {
      if (h) hidden.add(key);
    }),
    ResetHiddenTips: vi.fn(async () => {
      hidden.clear();
    }),
    GetLocale: vi.fn(async () => ""),
    SetLocale: vi.fn(async () => {}),
  };
}

function TestHarness({ api }: { api: SettingsBindingAPI }) {
  const service = new SettingsService(api);
  return (
    <I18nProvider>
      <TipsProvider service={service}>
        <Trigger />
        <TipStack />
      </TipsProvider>
    </I18nProvider>
  );
}

function Trigger() {
  const { showTips } = useTips();
  return (
    <button
      onClick={() => showTips(["tips.map.polygon.startDraw"])}
      data-testid="trigger"
    >
      show
    </button>
  );
}

describe("TipStack / TipCard", () => {
  it("activeTips 空の時はレンダリングしない", () => {
    render(<TestHarness api={createMockApi()} />);
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("showTips 呼出で tip-card がレンダリングされ、i18n メッセージを表示", async () => {
    const user = userEvent.setup();
    render(<TestHarness api={createMockApi()} />);
    // hidden keys 初期ロード待ち
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    await user.click(screen.getByTestId("trigger"));

    const card = screen.getByRole("status");
    expect(card).toBeTruthy();
    expect(card.getAttribute("data-tip-key")).toBe(
      "tips.map.polygon.startDraw",
    );
    // ja デフォルトのメッセージが含まれる
    expect(card.textContent).toContain("ポリゴン描画");
  });

  it("「このメッセージを表示しない」ボタンで hideTip が呼ばれる", async () => {
    const api = createMockApi();
    const user = userEvent.setup();
    render(<TestHarness api={api} />);
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    await user.click(screen.getByTestId("trigger"));
    const dismiss = screen.getByRole("button", {
      name: "このメッセージを表示しない",
    });
    await user.click(dismiss);

    expect(api.SetTipHidden).toHaveBeenCalledWith(
      "tips.map.polygon.startDraw",
      true,
    );
    expect(screen.queryByRole("status")).toBeNull();
  });
});
