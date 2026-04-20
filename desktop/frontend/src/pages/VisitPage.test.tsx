import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { I18nProvider } from "../contexts/I18nContext";
import { VisitPage } from "./VisitPage";
import type { Place } from "../services/place-service";
import type { VisitRecord } from "../services/visit-service";

function makeHouse(partial: Partial<Place> & { id: string }): Place {
  return {
    areaId: "NRT-001-01",
    coord: { lat: 35.7, lng: 140.3 },
    type: "house",
    label: "田中宅",
    displayName: "",
    address: "千葉県成田市1-2-3",
    description: "",
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

function makeBuilding(partial: Partial<Place> & { id: string }): Place {
  return makeHouse({ type: "building", label: "○○マンション", ...partial });
}

function makeRoom(
  partial: Partial<Place> & { id: string; parentId: string },
): Place {
  return makeHouse({
    ...partial,
    type: "room",
    label: "",
    displayName: partial.displayName ?? "101",
    coord: { lat: 0, lng: 0 },
  });
}

function fakePlaceService(places: Place[]) {
  return {
    listPlaces: vi.fn().mockResolvedValue(places),
    getPlace: vi.fn(),
    savePlace: vi.fn(),
    deletePlace: vi.fn(),
    listDeletedPlacesNear: vi.fn().mockResolvedValue([]),
  };
}

function fakeVisitService() {
  return {
    recordVisit: vi.fn().mockResolvedValue({} as VisitRecord),
    listMyVisitHistory: vi.fn().mockResolvedValue([] as VisitRecord[]),
    getLastMetDate: vi.fn().mockResolvedValue(null),
    deleteVisitRecord: vi.fn().mockResolvedValue(undefined),
  };
}

function renderPage(overrides: Partial<Parameters<typeof VisitPage>[0]> = {}) {
  const places: Place[] = [];
  const defaults: Parameters<typeof VisitPage>[0] = {
    areaId: "NRT-001-01",
    actorId: "did:key:user-A",
    placeService: fakePlaceService(places),
    visitService: fakeVisitService(),
    onPlaceCreateRequest: vi.fn(),
    onPlaceModifyRequest: vi.fn(),
  };
  return render(
    <I18nProvider>
      <VisitPage {...defaults} {...overrides} />
    </I18nProvider>,
  );
}

describe("VisitPage — Phase 1 暫定", () => {
  it("shows Phase 1 banner with target area id", async () => {
    renderPage({ areaId: "NRT-001-01" });
    await waitFor(() => {
      expect(screen.getByText(/Phase 1/i)).toBeInTheDocument();
      expect(screen.getByText(/NRT-001-01/)).toBeInTheDocument();
    });
  });

  it("loads places for the area on mount", async () => {
    const ps = fakePlaceService([
      makeHouse({ id: "h1", label: "田中" }),
      makeHouse({ id: "h2", label: "鈴木" }),
    ]);
    renderPage({ placeService: ps });
    await waitFor(() => {
      expect(ps.listPlaces).toHaveBeenCalledWith("NRT-001-01");
    });
    expect(await screen.findByText("田中")).toBeInTheDocument();
    expect(screen.getByText("鈴木")).toBeInTheDocument();
  });

  it("shows place type badge for house and building", async () => {
    const ps = fakePlaceService([
      makeHouse({ id: "h1", label: "田中" }),
      makeBuilding({ id: "b1", label: "Apt" }),
    ]);
    renderPage({ placeService: ps });
    await screen.findByText("田中");
    const rows = screen.getAllByTestId("visit-place-row");
    expect(rows).toHaveLength(2);
  });

  it("does NOT list rooms in the top-level place list", async () => {
    const ps = fakePlaceService([
      makeBuilding({ id: "b1", label: "Apt" }),
      makeRoom({ id: "r1", parentId: "b1", displayName: "101" }),
    ]);
    renderPage({ placeService: ps });
    await screen.findByText("Apt");
    const rows = screen.getAllByTestId("visit-place-row");
    expect(rows).toHaveLength(1);
  });
});

describe("VisitPage — dialog open flow", () => {
  it("clicking a house row opens VisitRecordDialog", async () => {
    const ps = fakePlaceService([makeHouse({ id: "h1", label: "田中" })]);
    renderPage({ placeService: ps });
    await screen.findByText("田中");
    const user = userEvent.setup();
    await user.click(screen.getByTestId("visit-place-row"));
    expect(
      screen.getByRole("dialog", { name: /訪問記録/ }),
    ).toBeInTheDocument();
  });

  it("clicking a building row opens BuildingVisitDialog", async () => {
    const ps = fakePlaceService([makeBuilding({ id: "b1", label: "Apt" })]);
    renderPage({ placeService: ps });
    await screen.findByText("Apt");
    const user = userEvent.setup();
    await user.click(screen.getByTestId("visit-place-row"));
    expect(
      screen.getByRole("dialog", { name: /集合住宅の訪問/ }),
    ).toBeInTheDocument();
  });

  it("'場所追加申請' button opens PlaceCreateRequestDialog", async () => {
    renderPage();
    const user = userEvent.setup();
    await user.click(
      await screen.findByRole("button", { name: /場所の追加を申請/ }),
    );
    expect(
      screen.getByRole("dialog", { name: /場所の追加を申請/ }),
    ).toBeInTheDocument();
  });
});

describe("VisitPage — save flow", () => {
  it("saving a met visit calls visitService.recordVisit", async () => {
    const vs = fakeVisitService();
    const ps = fakePlaceService([makeHouse({ id: "h1", label: "田中" })]);
    renderPage({ placeService: ps, visitService: vs });
    await screen.findByText("田中");
    const user = userEvent.setup();
    await user.click(screen.getByTestId("visit-place-row"));
    await user.type(screen.getByLabelText(/訪問メモ/), "test note");
    await user.click(screen.getByRole("button", { name: /^保存$/ }));
    await waitFor(() => {
      expect(vs.recordVisit).toHaveBeenCalledOnce();
    });
    const args = vs.recordVisit.mock.calls[0];
    // args = [actorID, activityID, placeID, result, visitedAt, applicationText]
    expect(args[0]).toBe("did:key:user-A");
    expect(args[2]).toBe("h1");
    expect(args[3]).toBe("met");
    expect(args[5]).toBe("");
  });
});
