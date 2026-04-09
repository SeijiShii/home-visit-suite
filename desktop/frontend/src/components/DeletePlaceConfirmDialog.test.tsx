import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { DeletePlaceConfirmDialog } from "./DeletePlaceConfirmDialog";
import { I18nProvider } from "../contexts/I18nContext";
import {
  SettingsService,
  type SettingsBindingAPI,
} from "../services/settings-service";

function createSettingsApi(): SettingsBindingAPI {
  return {
    GetHiddenTipKeys: vi.fn(async () => [] as string[]),
    SetTipHidden: vi.fn(async () => {}),
    ResetHiddenTips: vi.fn(async () => {}),
    GetLocale: vi.fn(async () => "ja"),
    SetLocale: vi.fn(async () => {}),
    GetAreaDetailRadiusKm: vi.fn(async () => 5),
    SetAreaDetailRadiusKm: vi.fn(async () => {}),
  };
}

function renderWith(ui: React.ReactElement) {
  const settings = new SettingsService(createSettingsApi());
  return render(<I18nProvider service={settings}>{ui}</I18nProvider>);
}

describe("DeletePlaceConfirmDialog", () => {
  it("確認文と 2 ボタンを表示", () => {
    renderWith(
      <DeletePlaceConfirmDialog onConfirm={vi.fn()} onCancel={vi.fn()} />,
    );
    expect(screen.getByText("この場所を削除しますか？")).toBeDefined();
    expect(screen.getByText("削除")).toBeDefined();
    expect(screen.getByText("いいえ")).toBeDefined();
  });

  it("削除ボタンで onConfirm", () => {
    const onConfirm = vi.fn();
    renderWith(
      <DeletePlaceConfirmDialog onConfirm={onConfirm} onCancel={vi.fn()} />,
    );
    fireEvent.click(screen.getByText("削除"));
    expect(onConfirm).toHaveBeenCalledOnce();
  });

  it("いいえボタンで onCancel", () => {
    const onCancel = vi.fn();
    renderWith(
      <DeletePlaceConfirmDialog onConfirm={vi.fn()} onCancel={onCancel} />,
    );
    fireEvent.click(screen.getByText("いいえ"));
    expect(onCancel).toHaveBeenCalledOnce();
  });

  it("Esc キーで onCancel", () => {
    const onCancel = vi.fn();
    renderWith(
      <DeletePlaceConfirmDialog onConfirm={vi.fn()} onCancel={onCancel} />,
    );
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onCancel).toHaveBeenCalledOnce();
  });
});
