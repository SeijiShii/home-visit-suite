// PlaceListPanel: 場所一覧と訪問記録の一覧（docs/wants/03「場所一覧と訪問記録の一覧」）。
// 直近記録の併記・行クリックでの記録展開・並替の権限ゲート・オーバーレイ表示を検証する。

import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { I18nProvider } from "../contexts/I18nContext";
import { setLocale } from "../i18n/i18n-util";
import { PlaceListPanel } from "./PlaceListPanel";
import type { Place } from "../services/place-service";
import type { VisitRecord } from "../services/visit-service";

function makePlace(partial: Partial<Place>): Place {
  return {
    id: "p1",
    areaId: "NRT-001-01",
    coord: { lat: 35.7, lng: 140.3 },
    type: "house",
    label: "田中宅",
    displayName: "",
    address: "",
    description: "",
    parentId: "",
    sortOrder: 0,
    languages: [],
    doNotVisit: false,
    doNotVisitNote: "",
    createdAt: "2026-07-01T00:00:00Z",
    updatedAt: "2026-07-01T00:00:00Z",
    deletedAt: null,
    restoredFromId: null,
    ...partial,
  };
}

function makeRecord(partial: Partial<VisitRecord>): VisitRecord {
  return {
    id: "v1",
    userId: "u1",
    placeId: "p1",
    coord: null,
    areaId: "NRT-001-01",
    checkoutId: "",
    result: "met",
    appliedRequestId: null,
    visitedAt: "2026-07-10T09:00:00Z",
    createdAt: "2026-07-10T09:00:00Z",
    updatedAt: "2026-07-10T09:00:00Z",
    ...partial,
  };
}

function renderPanel(
  props: Partial<Parameters<typeof PlaceListPanel>[0]> = {},
) {
  const defaults: Parameters<typeof PlaceListPanel>[0] = {
    places: [makePlace({})],
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

beforeEach(() => {
  localStorage.clear();
  setLocale("ja");
});

describe("PlaceListPanel の訪問記録併記", () => {
  it("visitRecords 指定時、行に直近の記録（結果）を表示する", () => {
    renderPanel({
      visitRecords: new Map([
        ["p1", [makeRecord({ result: "met" })] as readonly VisitRecord[]],
      ]),
    });
    expect(screen.getByTestId("place-latest-visit").textContent).toContain(
      "会えた",
    );
  });

  it("記録が無い場所は「記録なし」を表示する", () => {
    renderPanel({ visitRecords: new Map() });
    expect(screen.getByTestId("place-latest-visit").textContent).toBe(
      "記録なし",
    );
  });

  it("行クリックで記録一覧を展開し、集合住宅は部屋の記録も部屋番号付きで表示する", () => {
    const building = makePlace({ id: "b1", type: "building", label: "○○荘" });
    const room = makePlace({
      id: "r1",
      type: "room",
      parentId: "b1",
      displayName: "101",
    });
    renderPanel({
      places: [building, room],
      rooms: [room],
      visitRecords: new Map([
        [
          "r1",
          [
            makeRecord({ id: "v2", placeId: "r1", result: "absent" }),
          ] as readonly VisitRecord[],
        ],
      ]),
    });
    fireEvent.click(screen.getByText("○○荘"));
    const records = screen.getByTestId("place-visit-records");
    expect(records.textContent).toContain("101");
    expect(records.textContent).toContain("留守");
  });

  it("visitRecords 未指定なら記録行は描画しない（後方互換）", () => {
    renderPanel();
    expect(screen.queryByTestId("place-latest-visit")).toBeNull();
  });
});

describe("PlaceListPanel の並替権限ゲート", () => {
  it("reorderEnabled=false のとき行はドラッグ不可", () => {
    renderPanel({ reorderEnabled: false });
    const row = screen.getByRole("listitem");
    expect(row.getAttribute("draggable")).toBe("false");
  });
});

describe("PlaceListPanel のオーバーレイ表示", () => {
  it("variant=overlay では全面オーバーレイと閉じるボタンを描画する", () => {
    const onToggleOpen = vi.fn();
    renderPanel({ variant: "overlay", onToggleOpen });
    expect(screen.getByTestId("place-list-overlay")).toBeInTheDocument();
    fireEvent.click(screen.getByText("閉じる"));
    expect(onToggleOpen).toHaveBeenCalledWith(false);
  });
});
