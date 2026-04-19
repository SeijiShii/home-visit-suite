import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { AreaDetailContextMenu } from "./AreaDetailContextMenu";
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

describe("AreaDetailContextMenu", () => {
  const base = { x: 10, y: 20, onClose: vi.fn() };

  it("blank: 家を追加と集合住宅を追加を表示", () => {
    renderWith(<AreaDetailContextMenu {...base} variant="blank" />);
    const menu = screen.getByRole("menu");
    expect(menu.style.left).toBe("10px");
    expect(menu.style.top).toBe("20px");
    expect(screen.getByText("家を追加")).toBeDefined();
    expect(screen.getByText("集合住宅を追加")).toBeDefined();
    expect(screen.queryByText("移動")).toBeNull();
    expect(screen.queryByText("削除")).toBeNull();
  });

  it("blank: 集合住宅を追加クリックで onAddBuilding と onClose", () => {
    const onAddBuilding = vi.fn();
    const onClose = vi.fn();
    renderWith(
      <AreaDetailContextMenu
        {...base}
        variant="blank"
        onAddBuilding={onAddBuilding}
        onClose={onClose}
      />,
    );
    fireEvent.click(screen.getByText("集合住宅を追加"));
    expect(onAddBuilding).toHaveBeenCalledOnce();
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("blank: 家を追加クリックで onAddHouse と onClose", () => {
    const onAddHouse = vi.fn();
    const onClose = vi.fn();
    renderWith(
      <AreaDetailContextMenu
        {...base}
        variant="blank"
        onAddHouse={onAddHouse}
        onClose={onClose}
      />,
    );
    fireEvent.click(screen.getByText("家を追加"));
    expect(onAddHouse).toHaveBeenCalledOnce();
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("place: 移動と削除を表示、家を追加は非表示", () => {
    renderWith(<AreaDetailContextMenu {...base} variant="place" />);
    expect(screen.getByText("移動")).toBeDefined();
    expect(screen.getByText("削除")).toBeDefined();
    expect(screen.queryByText("家を追加")).toBeNull();
  });

  it("place: 移動クリックで onMovePlace と onClose", () => {
    const onMovePlace = vi.fn();
    const onClose = vi.fn();
    renderWith(
      <AreaDetailContextMenu
        {...base}
        variant="place"
        onMovePlace={onMovePlace}
        onClose={onClose}
      />,
    );
    fireEvent.click(screen.getByText("移動"));
    expect(onMovePlace).toHaveBeenCalledOnce();
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("place: 削除クリックで onDeletePlace と onClose", () => {
    const onDeletePlace = vi.fn();
    const onClose = vi.fn();
    renderWith(
      <AreaDetailContextMenu
        {...base}
        variant="place"
        onDeletePlace={onDeletePlace}
        onClose={onClose}
      />,
    );
    fireEvent.click(screen.getByText("削除"));
    expect(onDeletePlace).toHaveBeenCalledOnce();
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("メニュー外クリックで onClose", () => {
    const onClose = vi.fn();
    renderWith(
      <div>
        <AreaDetailContextMenu {...base} variant="blank" onClose={onClose} />
        <button data-testid="outside">外</button>
      </div>,
    );
    fireEvent.mouseDown(screen.getByTestId("outside"));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("Escape キーで onClose", () => {
    const onClose = vi.fn();
    renderWith(
      <AreaDetailContextMenu {...base} variant="blank" onClose={onClose} />,
    );
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledOnce();
  });
});
