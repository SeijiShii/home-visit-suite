import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { I18nProvider } from "../contexts/I18nContext";
import { VisitRecordDialog } from "./VisitRecordDialog";
import type { VisitRecord } from "../services/visit-service";

function renderDialog(
  overrides: Partial<Parameters<typeof VisitRecordDialog>[0]> = {},
) {
  const defaults: Parameters<typeof VisitRecordDialog>[0] = {
    placeLabel: "田中宅",
    placeAddress: "千葉県成田市1-2-3",
    placeId: "p1",
    lastMetDate: null,
    myHistory: [],
    onSave: vi.fn(),
    onCancel: vi.fn(),
    onPlaceModifyRequest: vi.fn(),
  };
  return render(
    <I18nProvider>
      <VisitRecordDialog {...defaults} {...overrides} />
    </I18nProvider>,
  );
}

describe("VisitRecordDialog — basic shell", () => {
  it("renders place label and address in header", () => {
    renderDialog({ placeLabel: "田中宅", placeAddress: "千葉県1-2-3" });
    expect(screen.getByText("田中宅")).toBeInTheDocument();
    expect(screen.getByText("千葉県1-2-3")).toBeInTheDocument();
  });

  it("renders 5-option visit-result spinner", () => {
    renderDialog();
    const select = screen.getByLabelText(/訪問ステータス/) as HTMLSelectElement;
    const optionValues = Array.from(select.options).map((o) => o.value);
    expect(optionValues).toEqual([
      "met",
      "absent",
      "vacant_possible",
      "vacant_abandoned",
      "refused",
    ]);
  });

  it("default visitedAt is now (datetime-local input populated)", () => {
    renderDialog();
    const dt = screen.getByLabelText(/日時/) as HTMLInputElement;
    expect(dt.value).not.toBe("");
  });

  it("renders memo textarea (個人メモ)", () => {
    renderDialog();
    expect(screen.getByLabelText(/訪問メモ/)).toBeInTheDocument();
  });

  it("Save with met status calls onSave with values (no application)", async () => {
    const onSave = vi.fn();
    renderDialog({ onSave });
    const user = userEvent.setup();
    await user.type(screen.getByLabelText(/訪問メモ/), "また訪ねる");
    await user.click(screen.getByRole("button", { name: /保存/ }));
    expect(onSave).toHaveBeenCalledOnce();
    const arg = onSave.mock.calls[0][0];
    expect(arg.result).toBe("met");
    expect(arg.note).toBe("また訪ねる");
    expect(arg.applicationText).toBe("");
    expect(arg.visitedAt).toBeInstanceOf(Date);
  });

  it("Cancel calls onCancel", async () => {
    const onCancel = vi.fn();
    renderDialog({ onCancel });
    await userEvent.click(screen.getByRole("button", { name: /キャンセル/ }));
    expect(onCancel).toHaveBeenCalled();
  });
});

describe("VisitRecordDialog — last met date display", () => {
  it("shows '会えた記録なし' when lastMetDate is null", () => {
    renderDialog({ lastMetDate: null });
    expect(screen.getByText(/会えた記録なし/)).toBeInTheDocument();
  });

  it("renders last met date in red when within 1 month", () => {
    const recent = new Date();
    recent.setDate(recent.getDate() - 14);
    renderDialog({ lastMetDate: recent });
    const el = screen.getByTestId("last-met-date");
    expect(el).toHaveClass("last-met-recent");
  });

  it("renders last met date in orange when within 6 months", () => {
    const mid = new Date();
    mid.setDate(mid.getDate() - 90);
    renderDialog({ lastMetDate: mid });
    const el = screen.getByTestId("last-met-date");
    expect(el).toHaveClass("last-met-mid");
  });

  it("renders last met date in default when older than 6 months", () => {
    const old = new Date();
    old.setDate(old.getDate() - 365);
    renderDialog({ lastMetDate: old });
    const el = screen.getByTestId("last-met-date");
    expect(el).toHaveClass("last-met-old");
  });
});

describe("VisitRecordDialog — my history section", () => {
  function makeRecord(
    partial: Partial<VisitRecord> & { id: string },
  ): VisitRecord {
    return {
      userId: "u1",
      placeId: "p1",
      coord: null,
      areaId: "a1",
      activityId: "act-1",
      result: "met",
      appliedRequestId: null,
      visitedAt: "2026-04-01T09:00:00Z",
      createdAt: "2026-04-01T09:00:00Z",
      updatedAt: "2026-04-01T09:00:00Z",
      ...partial,
    };
  }

  it("shows '自分の訪問履歴なし' when myHistory empty", () => {
    renderDialog({ myHistory: [] });
    expect(screen.getByText(/自分の訪問履歴なし/)).toBeInTheDocument();
  });

  it("lists records (collapsed by default, expand to show)", async () => {
    renderDialog({
      myHistory: [
        makeRecord({
          id: "h1",
          visitedAt: "2026-04-15T09:00:00Z",
          result: "met",
        }),
        makeRecord({
          id: "h2",
          visitedAt: "2026-04-10T10:00:00Z",
          result: "absent",
        }),
      ],
    });
    const user = userEvent.setup();
    // Toggle collapsed → expanded
    await user.click(screen.getByRole("button", { name: /訪問履歴/ }));
    const items = screen.getAllByTestId("history-row");
    expect(items).toHaveLength(2);
  });
});

describe("VisitRecordDialog — application text flow", () => {
  it("opens text dialog when refused selected, on submit calls onSave with applicationText", async () => {
    const onSave = vi.fn();
    renderDialog({ onSave });
    const user = userEvent.setup();
    await user.selectOptions(
      screen.getByLabelText(/訪問ステータス/),
      "refused",
    );
    // The application text dialog should appear
    const textArea = await screen.findByLabelText("申請内容");
    await user.type(textArea, "玄関で『今後一切来ないで』と明確な意思表示");
    await user.click(
      screen.getByRole("button", { name: /申請内容を含めて保存/ }),
    );
    expect(onSave).toHaveBeenCalledOnce();
    const arg = onSave.mock.calls[0][0];
    expect(arg.result).toBe("refused");
    expect(arg.applicationText).toBe(
      "玄関で『今後一切来ないで』と明確な意思表示",
    );
  });

  it("cancelling application text reverts the spinner selection", async () => {
    renderDialog();
    const user = userEvent.setup();
    const select = screen.getByLabelText(/訪問ステータス/) as HTMLSelectElement;
    await user.selectOptions(select, "vacant_abandoned");
    await user.click(
      await screen.findByRole("button", { name: /申請をキャンセル/ }),
    );
    // Spinner should revert to met (default)
    expect(select.value).toBe("met");
  });
});

describe("VisitRecordDialog — place modify request button", () => {
  it("clicking modify-request button opens text dialog", async () => {
    renderDialog();
    const user = userEvent.setup();
    await user.click(
      screen.getByRole("button", { name: /場所情報の修正を申請/ }),
    );
    expect(screen.getByLabelText(/修正内容/)).toBeInTheDocument();
  });

  it("submitting modify-request text calls onPlaceModifyRequest", async () => {
    const onPlaceModifyRequest = vi.fn();
    renderDialog({ onPlaceModifyRequest });
    const user = userEvent.setup();
    await user.click(
      screen.getByRole("button", { name: /場所情報の修正を申請/ }),
    );
    await user.type(screen.getByLabelText(/修正内容/), "表札の文字が異なる");
    await user.click(screen.getByRole("button", { name: /申請を送信/ }));
    expect(onPlaceModifyRequest).toHaveBeenCalledWith("表札の文字が異なる");
  });
});
