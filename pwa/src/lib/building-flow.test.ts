// 部屋の同番号復元と訪問ダイアログからの部屋追加プラン。
// 仕様 docs/wants/03「場所の論理削除と訪問記録の紐付け／部屋（Room）の同番号復元」
// - 追加時に同一 Building 内で部屋番号一致の削除済み Room があれば同一 PlaceID で復元する
// - 空欄はマッチング対象外、複数一致は DeletedAt 最新、編集（改名）は対象外

import { describe, expect, it } from "vitest";
import type { Place } from "../services/place-service";
import {
  applyRoomRowsSave,
  buildRoomRows,
  findRestorableRoom,
  roomRowsUnchanged,
} from "./building-flow";

function makeRoom(overrides: Partial<Place>): Place {
  return {
    id: "room-1",
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
    deletedAt: null,
    restoredFromId: null,
    ...overrides,
  };
}

describe("findRestorableRoom", () => {
  it("同一 Building 内で部屋番号が一致する削除済み Room を返す", () => {
    const deleted = makeRoom({
      id: "room-a",
      displayName: "101",
      deletedAt: "2026-07-01T00:00:00.000Z",
    });
    expect(findRestorableRoom([deleted], "bldg-1", "101")).toEqual(deleted);
  });

  it("部屋番号は前後空白を無視して比較する", () => {
    const deleted = makeRoom({
      id: "room-a",
      displayName: " 101 ",
      deletedAt: "2026-07-01T00:00:00.000Z",
    });
    expect(findRestorableRoom([deleted], "bldg-1", "101 ")?.id).toBe("room-a");
  });

  it("空欄の部屋番号はマッチングしない", () => {
    const deleted = makeRoom({
      id: "room-a",
      displayName: "",
      deletedAt: "2026-07-01T00:00:00.000Z",
    });
    expect(findRestorableRoom([deleted], "bldg-1", "")).toBeNull();
    expect(findRestorableRoom([deleted], "bldg-1", "  ")).toBeNull();
  });

  it("別 Building・未削除・番号不一致・room 以外は対象外", () => {
    const otherBuilding = makeRoom({
      id: "room-a",
      parentId: "bldg-2",
      deletedAt: "2026-07-01T00:00:00.000Z",
    });
    const notDeleted = makeRoom({ id: "room-b", deletedAt: null });
    const otherNumber = makeRoom({
      id: "room-c",
      displayName: "202",
      deletedAt: "2026-07-01T00:00:00.000Z",
    });
    const notRoom = makeRoom({
      id: "place-d",
      type: "house",
      deletedAt: "2026-07-01T00:00:00.000Z",
    });
    expect(
      findRestorableRoom(
        [otherBuilding, notDeleted, otherNumber, notRoom],
        "bldg-1",
        "101",
      ),
    ).toBeNull();
  });

  it("複数一致は DeletedAt が最新のものを返す", () => {
    const older = makeRoom({
      id: "room-old",
      deletedAt: "2026-06-01T00:00:00.000Z",
    });
    const newer = makeRoom({
      id: "room-new",
      deletedAt: "2026-07-01T00:00:00.000Z",
    });
    expect(findRestorableRoom([older, newer], "bldg-1", "101")?.id).toBe(
      "room-new",
    );
  });
});

describe("buildRoomRows / roomRowsUnchanged（部屋編集モードの行構築と変更判定）", () => {
  it("既存 Room を sortOrder 昇順で行にする（existingId 付与）", () => {
    const rooms = [
      makeRoom({ id: "r2", displayName: "102", sortOrder: 1 }),
      makeRoom({ id: "r1", displayName: "101", sortOrder: 0 }),
    ];
    expect(buildRoomRows(rooms)).toEqual([
      { key: "existing-r1", existingId: "r1", displayName: "101" },
      { key: "existing-r2", existingId: "r2", displayName: "102" },
    ]);
  });

  it("Room が 0 件なら空の新規行を 1 つ作る", () => {
    const rows = buildRoomRows([]);
    expect(rows).toHaveLength(1);
    expect(rows[0].existingId).toBeNull();
    expect(rows[0].displayName).toBe("");
  });

  it("roomRowsUnchanged は番号変更・行追加・行削除を変更として検出する", () => {
    const base = buildRoomRows([makeRoom({ id: "r1", displayName: "101" })]);
    expect(roomRowsUnchanged(base, [...base])).toBe(true);
    expect(roomRowsUnchanged(base, [{ ...base[0], displayName: "202" }])).toBe(
      false,
    );
    expect(
      roomRowsUnchanged(base, [
        ...base,
        { key: "new-1", existingId: null, displayName: "" },
      ]),
    ).toBe(false);
    expect(roomRowsUnchanged(base, [])).toBe(false);
  });
});

describe("applyRoomRowsSave（集合住宅編集ダイアログの差分保存）", () => {
  // deletePlace が論理削除する簡易フェイク。listDeletedRooms は削除実行後の
  // 状態を返す（実リポジトリと同じ規約）。
  function makeFakeService(initial: Place[]) {
    const store = new Map(initial.map((p) => [p.id, { ...p }]));
    const saved: Place[] = [];
    let seq = 0;
    return {
      store,
      saved,
      savePlace: async (place: Place) => {
        const next = place.id === "" ? { ...place, id: `gen-${++seq}` } : place;
        store.set(next.id, { ...next });
        saved.push({ ...next });
        return next;
      },
      deletePlace: async (id: string) => {
        const p = store.get(id);
        if (p) p.deletedAt = "2026-07-17T00:00:00.000Z";
      },
      listDeletedRooms: async (buildingId: string) =>
        [...store.values()].filter(
          (p) =>
            p.type === "room" && p.parentId === buildingId && !!p.deletedAt,
        ),
    };
  }

  it("同一保存内の「行削除＋同番号再追加」でも復元され、訪問記録の紐付き（PlaceID）を失わない", async () => {
    const room101 = makeRoom({ id: "room-101", displayName: "101" });
    const svc = makeFakeService([room101]);
    await applyRoomRowsSave(svc, {
      existingRooms: [room101],
      baseExistingIds: ["room-101"],
      rows: [{ key: "k1", existingId: null, displayName: "101" }],
      buildingId: "bldg-1",
      areaId: "NRT-001-01",
    });
    const stored = svc.store.get("room-101");
    expect(stored?.deletedAt).toBeNull(); // 同一 ID で復元
    expect(stored?.sortOrder).toBe(0); // 行順
    // 新規 Place は作られない
    expect([...svc.store.keys()]).toEqual(["room-101"]);
  });

  it("追加・更新・削除の通常差分がそのまま適用される", async () => {
    const room101 = makeRoom({ id: "room-101", displayName: "101" });
    const room102 = makeRoom({
      id: "room-102",
      displayName: "102",
      sortOrder: 1,
    });
    const svc = makeFakeService([room101, room102]);
    await applyRoomRowsSave(svc, {
      existingRooms: [room101, room102],
      baseExistingIds: ["room-101", "room-102"],
      rows: [
        { key: "k1", existingId: "room-101", displayName: "101A" },
        { key: "k2", existingId: null, displayName: "201" },
      ],
      buildingId: "bldg-1",
      areaId: "NRT-001-01",
    });
    expect(svc.store.get("room-101")?.displayName).toBe("101A");
    expect(svc.store.get("room-102")?.deletedAt).toBeTruthy(); // 行から消えた → 論理削除
    const added = [...svc.store.values()].find((p) => p.displayName === "201");
    expect(added).toBeTruthy();
    expect(added?.areaId).toBe("NRT-001-01");
    expect(added?.sortOrder).toBe(1);
  });

  it("既に削除済みだった同番号 Room の復元も引き続き働く", async () => {
    const deleted = makeRoom({
      id: "room-old",
      displayName: "301",
      deletedAt: "2026-06-01T00:00:00.000Z",
    });
    const svc = makeFakeService([deleted]);
    await applyRoomRowsSave(svc, {
      existingRooms: [],
      baseExistingIds: [],
      rows: [{ key: "k1", existingId: null, displayName: "301" }],
      buildingId: "bldg-1",
      areaId: "NRT-001-01",
    });
    expect(svc.store.get("room-old")?.deletedAt).toBeNull();
    expect([...svc.store.keys()]).toEqual(["room-old"]);
  });

  it("同番号の追加行が複数あっても同じ Room を二重復元しない", async () => {
    const deleted = makeRoom({
      id: "room-old",
      displayName: "101",
      deletedAt: "2026-06-01T00:00:00.000Z",
    });
    const svc = makeFakeService([deleted]);
    await applyRoomRowsSave(svc, {
      existingRooms: [],
      baseExistingIds: [],
      rows: [
        { key: "k1", existingId: null, displayName: "101" },
        { key: "k2", existingId: null, displayName: "101" },
      ],
      buildingId: "bldg-1",
      areaId: "NRT-001-01",
    });
    // 1 行目は復元、2 行目は新規作成
    expect(svc.store.get("room-old")?.deletedAt).toBeNull();
    expect(svc.store.size).toBe(2);
  });

  it("編集開始後に同期受信で増えた部屋（base に無い）は削除・変更の対象にしない", async () => {
    const room101 = makeRoom({ id: "room-101", displayName: "101" });
    // 編集モード進入後に他端末から同期された部屋（行としては提示されていない）
    const roomSynced = makeRoom({
      id: "room-synced",
      displayName: "103",
      sortOrder: 2,
    });
    const svc = makeFakeService([room101, roomSynced]);
    await applyRoomRowsSave(svc, {
      existingRooms: [room101, roomSynced],
      baseExistingIds: ["room-101"],
      rows: [{ key: "k1", existingId: "room-101", displayName: "101A" }],
      buildingId: "bldg-1",
      areaId: "NRT-001-01",
    });
    expect(svc.store.get("room-101")?.displayName).toBe("101A");
    // 行に無いが base 外なので巻き添え削除しない
    expect(svc.store.get("room-synced")?.deletedAt).toBeFalsy();
    expect(svc.saved.find((p) => p.id === "room-synced")).toBeUndefined();
  });

  it("部屋番号は前後空白を除去して保存する", async () => {
    const room101 = makeRoom({ id: "room-101", displayName: "101" });
    const svc = makeFakeService([room101]);
    await applyRoomRowsSave(svc, {
      existingRooms: [room101],
      baseExistingIds: ["room-101"],
      rows: [
        { key: "k1", existingId: "room-101", displayName: " 101A " },
        { key: "k2", existingId: null, displayName: " 205 " },
      ],
      buildingId: "bldg-1",
      areaId: "NRT-001-01",
    });
    expect(svc.store.get("room-101")?.displayName).toBe("101A");
    const added = [...svc.store.values()].find((p) => p.id.startsWith("gen-"));
    expect(added?.displayName).toBe("205");
  });
});
