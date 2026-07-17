// InMemoryPlaceRepository の listDeletedRooms。
// 仕様 docs/wants/03「部屋（Room）の同番号復元」: 復元候補の削除済み部屋を
// Building 単位で取得できること。

import { beforeEach, describe, expect, it } from "vitest";
import type { Place } from "../../domain/models/place";
import { InMemoryPlaceRepository } from "./inmemory-place-repository";

function makePlace(overrides: Partial<Place>): Place {
  return {
    id: "p1",
    areaId: "NRT-001-01",
    coord: { lat: 0, lng: 0 },
    type: "room",
    label: "",
    displayName: "101",
    address: "",
    description: "",
    parentId: "bldg-1",
    sortOrder: 0,
    languages: [],
    doNotVisit: false,
    doNotVisitNote: "",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("InMemoryPlaceRepository.listDeletedRooms", () => {
  let repo: InMemoryPlaceRepository;

  beforeEach(() => {
    localStorage.clear();
    repo = new InMemoryPlaceRepository();
  });

  it("指定 Building 配下の削除済み部屋のみ返す", async () => {
    await repo.savePlace(makePlace({ id: "kept", displayName: "101" }));
    await repo.savePlace(makePlace({ id: "del-101", displayName: "102" }));
    await repo.savePlace(
      makePlace({ id: "other-bldg", parentId: "bldg-2", displayName: "103" }),
    );
    await repo.savePlace(
      makePlace({ id: "house", type: "house", parentId: "" }),
    );
    await repo.deletePlace("del-101");
    await repo.deletePlace("other-bldg");
    await repo.deletePlace("house");

    const deleted = await repo.listDeletedRooms("bldg-1");
    expect(deleted.map((p) => p.id)).toEqual(["del-101"]);
    expect(deleted[0].deletedAt).toBeTruthy();
  });

  it("削除済みがなければ空配列", async () => {
    await repo.savePlace(makePlace({ id: "kept" }));
    expect(await repo.listDeletedRooms("bldg-1")).toEqual([]);
  });
});
