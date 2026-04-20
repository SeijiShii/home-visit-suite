import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { I18nProvider } from "../contexts/I18nContext";
import { PlaceCreateRequestDialog } from "./PlaceCreateRequestDialog";

function renderDialog(
  overrides: Partial<Parameters<typeof PlaceCreateRequestDialog>[0]> = {},
) {
  const defaults: Parameters<typeof PlaceCreateRequestDialog>[0] = {
    lat: 35.7,
    lng: 140.3,
    onSave: vi.fn(),
    onCancel: vi.fn(),
  };
  return render(
    <I18nProvider>
      <PlaceCreateRequestDialog {...defaults} {...overrides} />
    </I18nProvider>,
  );
}

describe("PlaceCreateRequestDialog — basic", () => {
  it("renders 3-option kind selector (家/集合住宅/その他) defaulting to house", () => {
    renderDialog();
    const select = screen.getByLabelText(/種別/) as HTMLSelectElement;
    const optionValues = Array.from(select.options).map((o) => o.value);
    expect(optionValues).toEqual(["house", "building", "other"]);
    expect(select.value).toBe("house");
  });

  it("displays the captured coordinates", () => {
    renderDialog({ lat: 35.7123, lng: 140.3456 });
    expect(screen.getByText(/35\.7123/)).toBeInTheDocument();
    expect(screen.getByText(/140\.3456/)).toBeInTheDocument();
  });

  it("text input is required (save button disabled when empty)", () => {
    renderDialog();
    const saveBtn = screen.getByRole("button", { name: /申請を送信/ });
    expect(saveBtn).toBeDisabled();
  });

  it("save button enabled after entering text", async () => {
    renderDialog();
    const user = userEvent.setup();
    await user.type(screen.getByLabelText(/補足情報/), "新築の戸建て");
    expect(screen.getByRole("button", { name: /申請を送信/ })).toBeEnabled();
  });

  it("save calls onSave with kind, coord, text", async () => {
    const onSave = vi.fn();
    renderDialog({ lat: 35.5, lng: 140.5, onSave });
    const user = userEvent.setup();
    await user.selectOptions(screen.getByLabelText(/種別/), "building");
    await user.type(screen.getByLabelText(/補足情報/), "新築の集合住宅");
    await user.click(screen.getByRole("button", { name: /申請を送信/ }));
    expect(onSave).toHaveBeenCalledOnce();
    const arg = onSave.mock.calls[0][0];
    expect(arg.kind).toBe("building");
    expect(arg.lat).toBe(35.5);
    expect(arg.lng).toBe(140.5);
    expect(arg.text).toBe("新築の集合住宅");
  });

  it("Cancel calls onCancel", async () => {
    const onCancel = vi.fn();
    renderDialog({ onCancel });
    await userEvent.click(screen.getByRole("button", { name: /キャンセル/ }));
    expect(onCancel).toHaveBeenCalled();
  });

  it("trims whitespace; whitespace-only text keeps button disabled", async () => {
    renderDialog();
    const user = userEvent.setup();
    await user.type(screen.getByLabelText(/補足情報/), "   ");
    expect(screen.getByRole("button", { name: /申請を送信/ })).toBeDisabled();
  });
});
