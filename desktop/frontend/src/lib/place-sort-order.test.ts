import { describe, it, expect } from "vitest";
import type { Place } from "../services/place-service";
import {
  assignInitialSortOrder,
  reorderPlaces,
  nextSortOrder,
  needsInitialAssignment,
} from "./place-sort-order";

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

describe("needsInitialAssignment", () => {
  it("returns true when all places have sortOrder 0 and count >= 2", () => {
    const places = [makePlace({ id: "a" }), makePlace({ id: "b" })];
    expect(needsInitialAssignment(places)).toBe(true);
  });

  it("returns false when at least one place has a non-zero sortOrder", () => {
    const places = [
      makePlace({ id: "a", sortOrder: 0 }),
      makePlace({ id: "b", sortOrder: 1 }),
    ];
    expect(needsInitialAssignment(places)).toBe(false);
  });

  it("returns false for empty or single-place lists (no ordering needed)", () => {
    expect(needsInitialAssignment([])).toBe(false);
    expect(needsInitialAssignment([makePlace({ id: "a" })])).toBe(false);
  });
});

describe("assignInitialSortOrder", () => {
  it("assigns 0..N-1 by ascending CreatedAt", () => {
    const places = [
      makePlace({ id: "c", createdAt: "2026-03-01T00:00:00Z" }),
      makePlace({ id: "a", createdAt: "2026-01-01T00:00:00Z" }),
      makePlace({ id: "b", createdAt: "2026-02-01T00:00:00Z" }),
    ];
    const result = assignInitialSortOrder(places);
    expect(result.map((p) => [p.id, p.sortOrder])).toEqual([
      ["a", 0],
      ["b", 1],
      ["c", 2],
    ]);
  });

  it("returns a new array and does not mutate inputs", () => {
    const a = makePlace({ id: "a", createdAt: "2026-01-01T00:00:00Z" });
    const b = makePlace({ id: "b", createdAt: "2026-02-01T00:00:00Z" });
    const input = [b, a];
    const result = assignInitialSortOrder(input);
    expect(input[0]).toBe(b);
    expect(input[0].sortOrder).toBe(0); // original unchanged
    expect(result[0].id).toBe("a");
    expect(result[0]).not.toBe(a);
  });

  it("breaks ties by id for stable ordering", () => {
    const places = [
      makePlace({ id: "b", createdAt: "2026-01-01T00:00:00Z" }),
      makePlace({ id: "a", createdAt: "2026-01-01T00:00:00Z" }),
    ];
    const result = assignInitialSortOrder(places);
    expect(result.map((p) => p.id)).toEqual(["a", "b"]);
  });
});

describe("reorderPlaces", () => {
  const base = [
    makePlace({ id: "a", sortOrder: 0 }),
    makePlace({ id: "b", sortOrder: 1 }),
    makePlace({ id: "c", sortOrder: 2 }),
    makePlace({ id: "d", sortOrder: 3 }),
  ];

  it("moves an item forward and re-assigns 0..N-1", () => {
    const result = reorderPlaces(base, 0, 2); // a → pos 2
    expect(result.map((p) => [p.id, p.sortOrder])).toEqual([
      ["b", 0],
      ["c", 1],
      ["a", 2],
      ["d", 3],
    ]);
  });

  it("moves an item backward and re-assigns 0..N-1", () => {
    const result = reorderPlaces(base, 3, 1); // d → pos 1
    expect(result.map((p) => [p.id, p.sortOrder])).toEqual([
      ["a", 0],
      ["d", 1],
      ["b", 2],
      ["c", 3],
    ]);
  });

  it("is a no-op when indices are equal", () => {
    const result = reorderPlaces(base, 2, 2);
    expect(result.map((p) => p.id)).toEqual(["a", "b", "c", "d"]);
  });

  it("throws for out-of-range indices", () => {
    expect(() => reorderPlaces(base, -1, 0)).toThrow();
    expect(() => reorderPlaces(base, 0, 99)).toThrow();
  });

  it("does not mutate the input array", () => {
    const input = [...base];
    reorderPlaces(input, 0, 2);
    expect(input.map((p) => p.id)).toEqual(["a", "b", "c", "d"]);
    expect(input[0].sortOrder).toBe(0);
  });
});

describe("nextSortOrder", () => {
  it("returns max(sortOrder) + 1", () => {
    const places = [
      makePlace({ id: "a", sortOrder: 0 }),
      makePlace({ id: "b", sortOrder: 3 }),
      makePlace({ id: "c", sortOrder: 2 }),
    ];
    expect(nextSortOrder(places)).toBe(4);
  });

  it("returns 0 for empty list", () => {
    expect(nextSortOrder([])).toBe(0);
  });
});
