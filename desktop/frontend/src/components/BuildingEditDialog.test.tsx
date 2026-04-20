import { describe, it, expect, vi } from "vitest";
import { render, screen, within, fireEvent } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { I18nProvider } from "../contexts/I18nContext";
import { BuildingEditDialog } from "./BuildingEditDialog";
import type { Place } from "../services/place-service";

function makeRoom(partial: Partial<Place> & { id: string }): Place {
  return {
    areaId: "a1",
    coord: { lat: 0, lng: 0 },
    type: "room",
    label: "",
    displayName: "",
    address: "",
    description: "",
    parentId: "bldg-1",
    sortOrder: 0,
    languages: [],
    doNotVisit: false,
    doNotVisitNote: "",
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    deletedAt: null,
    restoredFromId: null,
    ...partial,
  };
}

function renderDialog(
  overrides: Partial<Parameters<typeof BuildingEditDialog>[0]> = {},
) {
  const defaults: Parameters<typeof BuildingEditDialog>[0] = {
    mode: "create",
    initialLabel: "",
    initialAddress: "",
    initialRooms: [],
    onSave: vi.fn(),
    onCancel: vi.fn(),
  };
  return render(
    <I18nProvider>
      <BuildingEditDialog {...defaults} {...overrides} />
    </I18nProvider>,
  );
}

describe("BuildingEditDialog — create mode", () => {
  it("renders title '集合住宅を追加' and starts with exactly 1 empty room row", () => {
    renderDialog({ mode: "create" });
    expect(
      screen.getByRole("dialog", { name: /集合住宅を追加/ }),
    ).toBeInTheDocument();
    const rows = screen.getAllByTestId("room-row");
    expect(rows).toHaveLength(1);
    const input = within(rows[0]).getByRole("textbox", {
      name: /部屋番号/,
    }) as HTMLInputElement;
    expect(input.value).toBe("");
  });

  it("+1 button adds one empty row", async () => {
    renderDialog({ mode: "create" });
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "+1" }));
    expect(screen.getAllByTestId("room-row")).toHaveLength(2);
  });

  it("+5 button adds 5 empty rows", async () => {
    renderDialog({ mode: "create" });
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "+5" }));
    expect(screen.getAllByTestId("room-row")).toHaveLength(6);
  });

  it("+10 button adds 10 empty rows", async () => {
    renderDialog({ mode: "create" });
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "+10" }));
    expect(screen.getAllByTestId("room-row")).toHaveLength(11);
  });

  it("last remaining row's delete button is disabled", () => {
    renderDialog({ mode: "create" });
    const row = screen.getByTestId("room-row");
    const removeBtn = within(row).getByRole("button", { name: /行を削除/ });
    expect(removeBtn).toBeDisabled();
  });

  it("saves with label/address and the current list of room displayNames", async () => {
    const onSave = vi.fn();
    renderDialog({ mode: "create", onSave });
    const user = userEvent.setup();
    await user.type(screen.getByLabelText(/名前/), "エイプリル荘");
    await user.type(screen.getByLabelText(/住所/), "千葉県1-2-3");
    await user.click(screen.getByRole("button", { name: "+1" }));
    const rows = screen.getAllByTestId("room-row");
    await user.type(
      within(rows[0]).getByRole("textbox", { name: /部屋番号/ }),
      "101",
    );
    await user.type(
      within(rows[1]).getByRole("textbox", { name: /部屋番号/ }),
      "102",
    );
    await user.click(screen.getByRole("button", { name: "保存" }));
    expect(onSave).toHaveBeenCalledOnce();
    const arg = onSave.mock.calls[0][0];
    expect(arg.label).toBe("エイプリル荘");
    expect(arg.address).toBe("千葉県1-2-3");
    expect(arg.rows.map((r: { displayName: string }) => r.displayName)).toEqual(
      ["101", "102"],
    );
  });

  it("saves with description when entered", async () => {
    const onSave = vi.fn();
    renderDialog({ mode: "create", onSave });
    const user = userEvent.setup();
    await user.type(
      screen.getByLabelText(/補足情報/),
      "オートロックあり。管理人室は1F北側。",
    );
    await user.click(screen.getByRole("button", { name: "保存" }));
    expect(onSave).toHaveBeenCalledOnce();
    const arg = onSave.mock.calls[0][0];
    expect(arg.description).toBe("オートロックあり。管理人室は1F北側。");
  });

  it("description defaults to empty string when not entered", async () => {
    const onSave = vi.fn();
    renderDialog({ mode: "create", onSave });
    await userEvent.click(screen.getByRole("button", { name: "保存" }));
    expect(onSave.mock.calls[0][0].description).toBe("");
  });

  it("Cancel button calls onCancel", async () => {
    const onCancel = vi.fn();
    renderDialog({ mode: "create", onCancel });
    await userEvent.click(screen.getByRole("button", { name: "キャンセル" }));
    expect(onCancel).toHaveBeenCalled();
  });

  it("drag and drop reorders rows", async () => {
    renderDialog({ mode: "create" });
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "+1" }));
    await user.click(screen.getByRole("button", { name: "+1" }));
    let rows = screen.getAllByTestId("room-row");
    // Fill distinct values
    const inputs = rows.map(
      (r) => within(r).getByRole("textbox") as HTMLInputElement,
    );
    await user.type(inputs[0], "A");
    await user.type(inputs[1], "B");
    await user.type(inputs[2], "C");
    rows = screen.getAllByTestId("room-row");
    // Drag row 0 to position 2
    fireEvent.dragStart(rows[0]);
    fireEvent.dragOver(rows[2]);
    fireEvent.drop(rows[2]);
    rows = screen.getAllByTestId("room-row");
    const values = rows.map(
      (r) => (within(r).getByRole("textbox") as HTMLInputElement).value,
    );
    expect(values).toEqual(["B", "C", "A"]);
  });
});

describe("BuildingEditDialog — edit mode", () => {
  const existingRooms: Place[] = [
    makeRoom({ id: "r1", displayName: "101", sortOrder: 0 }),
    makeRoom({ id: "r2", displayName: "102", sortOrder: 1 }),
    makeRoom({ id: "r3", displayName: "103", sortOrder: 2 }),
  ];

  it("renders title '集合住宅を編集' and initial rows from existing rooms", () => {
    renderDialog({
      mode: "edit",
      initialLabel: "Existing",
      initialAddress: "Addr",
      initialDescription: "事前注意：エレベーター故障中",
      initialRooms: existingRooms,
    });
    const descInput = screen.getByLabelText(/補足情報/) as HTMLTextAreaElement;
    expect(descInput.value).toBe("事前注意：エレベーター故障中");
    expect(
      screen.getByRole("dialog", { name: /集合住宅を編集/ }),
    ).toBeInTheDocument();
    const rows = screen.getAllByTestId("room-row");
    expect(rows).toHaveLength(3);
    expect(
      (within(rows[0]).getByRole("textbox") as HTMLInputElement).value,
    ).toBe("101");
    expect(
      (within(rows[2]).getByRole("textbox") as HTMLInputElement).value,
    ).toBe("103");
  });

  it("deleting an existing row shows a confirmation dialog; confirming removes the row", async () => {
    renderDialog({ mode: "edit", initialRooms: existingRooms });
    const user = userEvent.setup();
    const rows = screen.getAllByTestId("room-row");
    await user.click(within(rows[1]).getByRole("button", { name: /行を削除/ }));
    expect(screen.getByText(/この部屋を削除しますか/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /はい/ }));
    expect(screen.getAllByTestId("room-row")).toHaveLength(2);
  });

  it("cancelling the confirmation keeps the row", async () => {
    renderDialog({ mode: "edit", initialRooms: existingRooms });
    const user = userEvent.setup();
    const rows = screen.getAllByTestId("room-row");
    await user.click(within(rows[1]).getByRole("button", { name: /行を削除/ }));
    await user.click(screen.getByRole("button", { name: /いいえ/ }));
    expect(screen.getAllByTestId("room-row")).toHaveLength(3);
  });

  it("deleting a newly added (unsaved) row skips confirmation", async () => {
    renderDialog({ mode: "edit", initialRooms: existingRooms });
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "+1" }));
    expect(screen.getAllByTestId("room-row")).toHaveLength(4);
    const rows = screen.getAllByTestId("room-row");
    // last row is the newly added one
    await user.click(within(rows[3]).getByRole("button", { name: /行を削除/ }));
    // no confirmation dialog
    expect(
      screen.queryByText(/この部屋を削除しますか/),
    ).not.toBeInTheDocument();
    expect(screen.getAllByTestId("room-row")).toHaveLength(3);
  });

  it("saves with rows carrying existingId for unchanged rooms", async () => {
    const onSave = vi.fn();
    renderDialog({ mode: "edit", initialRooms: existingRooms, onSave });
    await userEvent.click(screen.getByRole("button", { name: "保存" }));
    expect(onSave).toHaveBeenCalledOnce();
    const rows = onSave.mock.calls[0][0].rows as Array<{
      existingId: string | null;
      displayName: string;
    }>;
    expect(rows.map((r) => r.existingId)).toEqual(["r1", "r2", "r3"]);
    expect(rows.map((r) => r.displayName)).toEqual(["101", "102", "103"]);
  });
});
