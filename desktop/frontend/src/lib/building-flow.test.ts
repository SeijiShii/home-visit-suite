import { describe, it, expect } from "vitest";
import type { Place } from "../services/place-service";
import {
  addRoomRows,
  removeRoomRow,
  reorderRoomRows,
  makeRoomRow,
  diffRoomRows,
  type RoomRow,
} from "./building-flow";

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

describe("makeRoomRow", () => {
  it("creates a new row with empty displayName and fresh key", () => {
    const r = makeRoomRow();
    expect(r.displayName).toBe("");
    expect(r.existingId).toBeNull();
    expect(r.key).toMatch(/.+/);
  });

  it("creates rows with unique keys across calls", () => {
    const keys = new Set<string>();
    for (let i = 0; i < 5; i++) keys.add(makeRoomRow().key);
    expect(keys.size).toBe(5);
  });
});

describe("addRoomRows", () => {
  it("appends n empty rows at the end", () => {
    const base: RoomRow[] = [
      { key: "k1", existingId: null, displayName: "101" },
    ];
    const next = addRoomRows(base, 3);
    expect(next).toHaveLength(4);
    expect(next[0]).toBe(base[0]); // first row unchanged
    expect(
      next.slice(1).every((r) => r.displayName === "" && r.existingId === null),
    ).toBe(true);
  });

  it("rejects zero or negative counts by returning the same list", () => {
    const base: RoomRow[] = [{ key: "k1", existingId: null, displayName: "" }];
    expect(addRoomRows(base, 0)).toEqual(base);
    expect(addRoomRows(base, -1)).toEqual(base);
  });

  it("does not mutate the input", () => {
    const base: RoomRow[] = [{ key: "k1", existingId: null, displayName: "A" }];
    addRoomRows(base, 2);
    expect(base).toHaveLength(1);
  });
});

describe("removeRoomRow", () => {
  const base: RoomRow[] = [
    { key: "a", existingId: null, displayName: "1" },
    { key: "b", existingId: "room-b", displayName: "2" },
    { key: "c", existingId: null, displayName: "3" },
  ];

  it("removes the row by key", () => {
    const next = removeRoomRow(base, "b");
    expect(next.map((r) => r.key)).toEqual(["a", "c"]);
  });

  it("is a no-op when the key is not found", () => {
    const next = removeRoomRow(base, "x");
    expect(next.map((r) => r.key)).toEqual(["a", "b", "c"]);
  });

  it("refuses to remove the last remaining row (returns same list)", () => {
    const single: RoomRow[] = [
      { key: "only", existingId: null, displayName: "" },
    ];
    expect(removeRoomRow(single, "only")).toEqual(single);
  });
});

describe("reorderRoomRows", () => {
  const base: RoomRow[] = [
    { key: "a", existingId: null, displayName: "" },
    { key: "b", existingId: null, displayName: "" },
    { key: "c", existingId: null, displayName: "" },
    { key: "d", existingId: null, displayName: "" },
  ];

  it("moves forward", () => {
    const next = reorderRoomRows(base, 0, 2);
    expect(next.map((r) => r.key)).toEqual(["b", "c", "a", "d"]);
  });

  it("moves backward", () => {
    const next = reorderRoomRows(base, 3, 1);
    expect(next.map((r) => r.key)).toEqual(["a", "d", "b", "c"]);
  });

  it("is a no-op when indices are equal", () => {
    const next = reorderRoomRows(base, 2, 2);
    expect(next.map((r) => r.key)).toEqual(["a", "b", "c", "d"]);
  });

  it("throws RangeError for out-of-range indices", () => {
    expect(() => reorderRoomRows(base, -1, 0)).toThrow(RangeError);
    expect(() => reorderRoomRows(base, 0, 9)).toThrow(RangeError);
  });
});

describe("diffRoomRows", () => {
  const buildingId = "bldg-1";

  it("classifies rows: adds (no existingId), updates (changed), unchanged, deletes (missing)", () => {
    const existing: Place[] = [
      makeRoom({ id: "r1", displayName: "101", sortOrder: 0 }),
      makeRoom({ id: "r2", displayName: "102", sortOrder: 1 }),
      makeRoom({ id: "r3", displayName: "103", sortOrder: 2 }),
    ];
    const rows: RoomRow[] = [
      { key: "k1", existingId: "r1", displayName: "101" }, // unchanged
      { key: "k2", existingId: "r2", displayName: "202" }, // updated
      { key: "k-new", existingId: null, displayName: "301" }, // added
      // r3 is missing → deleted
    ];
    const { toAdd, toUpdate, toDelete } = diffRoomRows(
      existing,
      rows,
      buildingId,
    );

    expect(toDelete).toEqual(["r3"]);

    expect(toUpdate).toHaveLength(1);
    expect(toUpdate[0].id).toBe("r2");
    expect(toUpdate[0].displayName).toBe("202");
    expect(toUpdate[0].sortOrder).toBe(1); // new index

    expect(toAdd).toHaveLength(1);
    expect(toAdd[0].type).toBe("room");
    expect(toAdd[0].parentId).toBe(buildingId);
    expect(toAdd[0].displayName).toBe("301");
    expect(toAdd[0].sortOrder).toBe(2);
    expect(toAdd[0].coord).toEqual({ lat: 0, lng: 0 });
    expect(toAdd[0].label).toBe("");
  });

  it("assigns sortOrder from the final row order", () => {
    const existing: Place[] = [
      makeRoom({ id: "r1", displayName: "A", sortOrder: 0 }),
      makeRoom({ id: "r2", displayName: "B", sortOrder: 1 }),
    ];
    // Swap order via rows
    const rows: RoomRow[] = [
      { key: "k1", existingId: "r2", displayName: "B" },
      { key: "k2", existingId: "r1", displayName: "A" },
    ];
    const { toUpdate } = diffRoomRows(existing, rows, buildingId);
    // Both are re-assigned because their sortOrder changed
    const byId = new Map(toUpdate.map((p) => [p.id, p.sortOrder]));
    expect(byId.get("r2")).toBe(0);
    expect(byId.get("r1")).toBe(1);
  });

  it("treats a row with existingId referring to a missing id as an add", () => {
    const existing: Place[] = [];
    const rows: RoomRow[] = [
      { key: "k1", existingId: "stale", displayName: "X" },
    ];
    const { toAdd, toUpdate, toDelete } = diffRoomRows(
      existing,
      rows,
      buildingId,
    );
    expect(toDelete).toEqual([]);
    expect(toUpdate).toEqual([]);
    expect(toAdd).toHaveLength(1);
    expect(toAdd[0].displayName).toBe("X");
  });
});
