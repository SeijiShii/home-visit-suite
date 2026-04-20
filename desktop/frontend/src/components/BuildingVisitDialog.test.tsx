import { describe, it, expect, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { I18nProvider } from "../contexts/I18nContext";
import { BuildingVisitDialog } from "./BuildingVisitDialog";
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
  overrides: Partial<Parameters<typeof BuildingVisitDialog>[0]> = {},
) {
  const defaults: Parameters<typeof BuildingVisitDialog>[0] = {
    buildingLabel: "○○マンション",
    buildingAddress: "千葉県成田市1-2-3",
    buildingDescription: "",
    rooms: [],
    roomLastVisitMap: new Map(),
    onSelectRoom: vi.fn(),
    onPlaceModifyRequest: vi.fn(),
    onCancel: vi.fn(),
  };
  return render(
    <I18nProvider>
      <BuildingVisitDialog {...defaults} {...overrides} />
    </I18nProvider>,
  );
}

describe("BuildingVisitDialog — header", () => {
  it("renders building label and address", () => {
    renderDialog({
      buildingLabel: "○○マンション",
      buildingAddress: "千葉県1-2-3",
    });
    expect(screen.getByText("○○マンション")).toBeInTheDocument();
    expect(screen.getByText("千葉県1-2-3")).toBeInTheDocument();
  });

  it("renders Description prominently when non-empty", () => {
    renderDialog({
      buildingDescription: "オートロックあり。1F北側に管理人室。",
    });
    const desc = screen.getByTestId("building-description");
    expect(desc).toBeInTheDocument();
    expect(desc).toHaveTextContent("オートロックあり");
  });

  it("does NOT render Description region when empty", () => {
    renderDialog({ buildingDescription: "" });
    expect(screen.queryByTestId("building-description")).not.toBeInTheDocument();
  });

  it("does not render a visit-result spinner (building has no spinner)", () => {
    renderDialog();
    expect(screen.queryByLabelText(/訪問ステータス/)).not.toBeInTheDocument();
  });
});

describe("BuildingVisitDialog — room list", () => {
  const rooms = [
    makeRoom({ id: "r1", displayName: "101", sortOrder: 0 }),
    makeRoom({ id: "r2", displayName: "102", sortOrder: 1 }),
    makeRoom({ id: "r3", displayName: "103", sortOrder: 2 }),
  ];

  it("renders rooms in sortOrder", () => {
    renderDialog({ rooms });
    const items = screen.getAllByTestId("room-row");
    expect(items).toHaveLength(3);
    expect(items[0]).toHaveTextContent("101");
    expect(items[2]).toHaveTextContent("103");
  });

  it("shows last visit date with color class for each room", () => {
    const recent = new Date();
    recent.setDate(recent.getDate() - 7);
    const old = new Date();
    old.setDate(old.getDate() - 365);
    renderDialog({
      rooms,
      roomLastVisitMap: new Map<string, Date | null>([
        ["r1", recent],
        ["r2", null],
        ["r3", old],
      ]),
    });
    const items = screen.getAllByTestId("room-row");
    expect(within(items[0]).getByTestId("room-last-visit")).toHaveClass(
      "last-met-recent",
    );
    expect(
      within(items[1]).queryByTestId("room-last-visit"),
    ).not.toBeInTheDocument();
    expect(within(items[2]).getByTestId("room-last-visit")).toHaveClass(
      "last-met-old",
    );
  });

  it("clicking a room calls onSelectRoom with that room", async () => {
    const onSelectRoom = vi.fn();
    renderDialog({ rooms, onSelectRoom });
    const user = userEvent.setup();
    const items = screen.getAllByTestId("room-row");
    await user.click(items[1]);
    expect(onSelectRoom).toHaveBeenCalledOnce();
    expect(onSelectRoom.mock.calls[0][0].id).toBe("r2");
  });

  it("renders empty-state message when rooms is empty", () => {
    renderDialog({ rooms: [] });
    expect(screen.getByText(/部屋情報なし/)).toBeInTheDocument();
  });
});

describe("BuildingVisitDialog — modify request", () => {
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
    await user.type(
      screen.getByLabelText(/修正内容/),
      "部屋番号が101ではなく1F-Aです",
    );
    await user.click(screen.getByRole("button", { name: /申請を送信/ }));
    expect(onPlaceModifyRequest).toHaveBeenCalledWith(
      "部屋番号が101ではなく1F-Aです",
    );
  });
});

describe("BuildingVisitDialog — close", () => {
  it("Cancel calls onCancel", async () => {
    const onCancel = vi.fn();
    renderDialog({ onCancel });
    await userEvent.click(screen.getByRole("button", { name: /閉じる/ }));
    expect(onCancel).toHaveBeenCalled();
  });
});
