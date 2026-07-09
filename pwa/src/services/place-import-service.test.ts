// PlaceImportService: AI 下書き場所の一時保持（stash）と、紐付け後の区域 Place 取込。
// docs/wants/03_地図機能.md Phase 1.1 / [論点-001]（紐付け後に明示取込）。

import { beforeEach, describe, expect, it } from "vitest";
import { InMemoryPendingImportPlaceRepository } from "../data/inmemory/inmemory-pending-import-place-repository";
import { InMemoryPlaceRepository } from "../data/inmemory/inmemory-place-repository";
import { PlaceRepositoryBindingAdapter } from "./place-binding-adapter";
import { PlaceService } from "./place-service";
import { PlaceImportService } from "./place-import-service";
import type { PlaceAssignment } from "../lib/assign-places-to-polygons";

let pendingRepo: InMemoryPendingImportPlaceRepository;
let placeRepo: InMemoryPlaceRepository;
let placeService: PlaceService;
let svc: PlaceImportService;

beforeEach(() => {
  pendingRepo = new InMemoryPendingImportPlaceRepository();
  placeRepo = new InMemoryPlaceRepository();
  placeService = new PlaceService(new PlaceRepositoryBindingAdapter(placeRepo));
  svc = new PlaceImportService(pendingRepo, placeService);
});

function assign(polygonId: string, number: number, label = ""): PlaceAssignment {
  return {
    polygonId,
    place: { geo: { lat: 35.768, lng: 140.3195 }, number, label, address: "" },
  };
}

describe("stash", () => {
  it("割り当てをポリゴン別に一時保持する", async () => {
    await svc.stash([assign("poly-A", 1), assign("poly-A", 2), assign("poly-B", 3)]);
    expect(await svc.pendingCount("poly-A")).toBe(2);
    expect(await svc.pendingCount("poly-B")).toBe(1);
  });

  it("空割り当ては何もしない", async () => {
    await svc.stash([]);
    expect(await svc.pendingCount("poly-A")).toBe(0);
  });
});

describe("importForArea", () => {
  it("紐付け後、指定ポリゴンの未確定場所を区域の戸建て Place として作成し pending を消す", async () => {
    await svc.stash([
      assign("poly-A", 1, "田中"),
      assign("poly-A", 2, "鈴木"),
    ]);

    const n = await svc.importForArea("area-1", ["poly-A"]);

    expect(n).toBe(2);
    const places = await placeService.listPlaces("area-1");
    expect(places).toHaveLength(2);
    expect(places.every((p) => p.type === "house")).toBe(true);
    expect(places.map((p) => p.label).sort()).toEqual(["田中", "鈴木"]);
    // sortOrder は 0,1 の連番
    expect(places.map((p) => p.sortOrder).sort()).toEqual([0, 1]);
    // 取込後 pending は空
    expect(await svc.pendingCount("poly-A")).toBe(0);
  });

  it("既存 Place がある区域では sortOrder を既存最大+1 から採番する", async () => {
    const now = new Date().toISOString();
    await placeService.savePlace({
      id: "",
      areaId: "area-1",
      coord: { lat: 35.767, lng: 140.318 },
      type: "house",
      label: "既存",
      displayName: "",
      address: "",
      description: "",
      parentId: "",
      sortOrder: 0,
      languages: [],
      doNotVisit: false,
      doNotVisitNote: "",
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
      restoredFromId: null,
    });

    await svc.stash([assign("poly-A", 1)]);
    await svc.importForArea("area-1", ["poly-A"]);

    const places = await placeService.listPlaces("area-1");
    expect(places).toHaveLength(2);
    expect(Math.max(...places.map((p) => p.sortOrder))).toBe(1);
  });

  it("pending が無ければ 0 件で何も作らない", async () => {
    expect(await svc.importForArea("area-1", ["poly-empty"])).toBe(0);
    expect(await placeService.listPlaces("area-1")).toHaveLength(0);
  });
});
