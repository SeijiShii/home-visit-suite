import { describe, it, expect, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { fireEvent } from "@testing-library/react";
import { I18nProvider } from "../contexts/I18nContext";
import type { Place } from "../services/place-service";
import { PlaceListPanel } from "./PlaceListPanel";

function makePlace(partial: Partial<Place> & { id: string }): Place {
  return {
    areaId: "a1",
    coord: { lat: 0, lng: 0 },
    type: "house",
    label: "",
    displayName: "",
    address: "",
    parentId: "",
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

function renderPanel(
  props: Partial<Parameters<typeof PlaceListPanel>[0]> = {},
) {
  const defaults: Parameters<typeof PlaceListPanel>[0] = {
    places: [],
    open: true,
    onToggleOpen: vi.fn(),
    onPlaceClick: vi.fn(),
    onReorder: vi.fn(),
    selectedPlaceId: null,
  };
  return render(
    <I18nProvider>
      <PlaceListPanel {...defaults} {...props} />
    </I18nProvider>,
  );
}

describe("PlaceListPanel", () => {
  it("renders a toggle button that calls onToggleOpen with next state", async () => {
    const onToggleOpen = vi.fn();
    renderPanel({ open: true, onToggleOpen });
    const btn = screen.getByRole("button", { name: /place-list/i });
    await userEvent.click(btn);
    expect(onToggleOpen).toHaveBeenCalledWith(false);
  });

  it("renders rows with 1-based badge numbers derived from sortOrder", () => {
    const places = [
      makePlace({ id: "a", sortOrder: 0, label: "Alpha" }),
      makePlace({ id: "b", sortOrder: 1, label: "Beta" }),
      makePlace({ id: "c", sortOrder: 2, label: "Gamma" }),
    ];
    renderPanel({ places });
    const rows = screen.getAllByRole("listitem");
    expect(rows).toHaveLength(3);
    expect(within(rows[0]).getByTestId("place-badge")).toHaveTextContent("1");
    expect(within(rows[1]).getByTestId("place-badge")).toHaveTextContent("2");
    expect(within(rows[2]).getByTestId("place-badge")).toHaveTextContent("3");
    expect(within(rows[0]).getByText("Alpha")).toBeInTheDocument();
  });

  it("shows '名前なし' when label is empty", () => {
    const places = [makePlace({ id: "a", sortOrder: 0, label: "" })];
    renderPanel({ places });
    expect(screen.getByText("名前なし")).toBeInTheDocument();
  });

  it("orders rows by sortOrder ascending regardless of input order", () => {
    const places = [
      makePlace({ id: "c", sortOrder: 2, label: "C" }),
      makePlace({ id: "a", sortOrder: 0, label: "A" }),
      makePlace({ id: "b", sortOrder: 1, label: "B" }),
    ];
    renderPanel({ places });
    const rows = screen.getAllByRole("listitem");
    expect(within(rows[0]).getByText("A")).toBeInTheDocument();
    expect(within(rows[1]).getByText("B")).toBeInTheDocument();
    expect(within(rows[2]).getByText("C")).toBeInTheDocument();
  });

  it("calls onPlaceClick when a row is clicked", async () => {
    const onPlaceClick = vi.fn();
    const places = [
      makePlace({ id: "a", sortOrder: 0, label: "Alpha" }),
      makePlace({ id: "b", sortOrder: 1, label: "Beta" }),
    ];
    renderPanel({ places, onPlaceClick });
    await userEvent.click(screen.getByText("Beta"));
    expect(onPlaceClick).toHaveBeenCalledWith("b");
  });

  it("marks the selected row with aria-selected=true", () => {
    const places = [
      makePlace({ id: "a", sortOrder: 0, label: "Alpha" }),
      makePlace({ id: "b", sortOrder: 1, label: "Beta" }),
    ];
    renderPanel({ places, selectedPlaceId: "b" });
    const rows = screen.getAllByRole("listitem");
    expect(rows[0]).toHaveAttribute("aria-selected", "false");
    expect(rows[1]).toHaveAttribute("aria-selected", "true");
  });

  it("does not render the list content when open=false", () => {
    const places = [makePlace({ id: "a", sortOrder: 0, label: "Alpha" })];
    renderPanel({ places, open: false });
    expect(screen.queryByRole("listitem")).not.toBeInTheDocument();
  });

  it("shows empty-state text when there are no places", () => {
    renderPanel({ places: [] });
    expect(screen.getByTestId("place-list-empty")).toBeInTheDocument();
  });

  it("calls onReorder(from, to) when a row is dragged over another", () => {
    const onReorder = vi.fn();
    const places = [
      makePlace({ id: "a", sortOrder: 0, label: "Alpha" }),
      makePlace({ id: "b", sortOrder: 1, label: "Beta" }),
      makePlace({ id: "c", sortOrder: 2, label: "Gamma" }),
    ];
    renderPanel({ places, onReorder });
    const rows = screen.getAllByRole("listitem");
    // Drag row 0 (a) onto row 2 (c)
    fireEvent.dragStart(rows[0]);
    fireEvent.dragOver(rows[2]);
    fireEvent.drop(rows[2]);
    expect(onReorder).toHaveBeenCalledWith(0, 2);
  });

  it("does not call onReorder when dropping onto the same row", () => {
    const onReorder = vi.fn();
    const places = [
      makePlace({ id: "a", sortOrder: 0, label: "Alpha" }),
      makePlace({ id: "b", sortOrder: 1, label: "Beta" }),
    ];
    renderPanel({ places, onReorder });
    const rows = screen.getAllByRole("listitem");
    fireEvent.dragStart(rows[0]);
    fireEvent.drop(rows[0]);
    expect(onReorder).not.toHaveBeenCalled();
  });

  it("renders building rows with room count badge (🏢 N部屋)", () => {
    const places = [
      makePlace({
        id: "b1",
        type: "building",
        sortOrder: 0,
        label: "Apt",
        address: "",
      }),
    ];
    renderPanel({
      places,
      roomCounts: new Map([["b1", 5]]),
    });
    const rows = screen.getAllByRole("listitem");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toHaveClass("is-building");
    expect(within(rows[0]).getByText(/🏢 5部屋/)).toBeInTheDocument();
  });

  it("hides rooms (type=room) from the list", () => {
    const places = [
      makePlace({ id: "h", sortOrder: 0, label: "House", type: "house" }),
      makePlace({
        id: "r1",
        sortOrder: 1,
        type: "room",
        parentId: "b1",
      }),
    ];
    renderPanel({ places });
    const rows = screen.getAllByRole("listitem");
    expect(rows).toHaveLength(1);
    expect(within(rows[0]).getByText("House")).toBeInTheDocument();
  });

  it("calls onPlaceDoubleClick with placeId on double-click", async () => {
    const onPlaceDoubleClick = vi.fn();
    const places = [
      makePlace({ id: "a", sortOrder: 0, label: "Alpha", type: "house" }),
      makePlace({ id: "b", sortOrder: 1, label: "Beta", type: "house" }),
    ];
    renderPanel({ places, onPlaceDoubleClick });
    const user = userEvent.setup();
    await user.dblClick(screen.getByText("Beta"));
    expect(onPlaceDoubleClick).toHaveBeenCalledWith("b");
  });
});
