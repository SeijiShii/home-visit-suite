// 表示番号の重複検出と幾何順再採番のテスト。
// 仕様: docs/wants/03_地図機能.md「区域編集画面での場所表示と番号再採番 / 表示番号の重複と再採番」

import { describe, expect, it } from "vitest";
import type { Place } from "../services/place-service";
import {
  hasDuplicateSortOrder,
  renumberByGeometry,
  renumberTargets,
} from "./place-renumber";

function place(overrides: Partial<Place> & { id: string }): Place {
  return {
    areaId: "NRT-001-01",
    coord: { lat: 35.0, lng: 140.0 },
    type: "house",
    label: "",
    displayName: "",
    address: "",
    description: "",
    parentId: "",
    sortOrder: 0,
    languages: [],
    doNotVisit: false,
    doNotVisitNote: "",
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

describe("renumberTargets", () => {
  it("削除済みと Room（parentId あり）を対象から外す", () => {
    const places = [
      place({ id: "a", sortOrder: 0 }),
      place({ id: "b", sortOrder: 1, deletedAt: "2026-01-02T00:00:00Z" }),
      place({ id: "c", sortOrder: 2, type: "room", parentId: "bld-1" }),
      place({ id: "d", sortOrder: 3, type: "building" }),
    ];
    expect(renumberTargets(places).map((p) => p.id)).toEqual(["a", "d"]);
  });
});

describe("hasDuplicateSortOrder", () => {
  it("重複が無ければ false（番号の欠落は重複ではない）", () => {
    const places = [
      place({ id: "a", sortOrder: 0 }),
      place({ id: "b", sortOrder: 2 }),
    ];
    expect(hasDuplicateSortOrder(places)).toBe(false);
  });

  it("同一 sortOrder が 2 件あれば true", () => {
    const places = [
      place({ id: "a", sortOrder: 1 }),
      place({ id: "b", sortOrder: 1 }),
    ];
    expect(hasDuplicateSortOrder(places)).toBe(true);
  });

  it("全件 sortOrder=0（未初期化）は重複扱いしない（CreatedAt 初期採番に委ねる）", () => {
    const places = [
      place({ id: "a", sortOrder: 0 }),
      place({ id: "b", sortOrder: 0 }),
      place({ id: "c", sortOrder: 0 }),
    ];
    expect(hasDuplicateSortOrder(places)).toBe(false);
  });

  it("一部だけ 0 が重複していれば true（未初期化ではない）", () => {
    const places = [
      place({ id: "a", sortOrder: 0 }),
      place({ id: "b", sortOrder: 0 }),
      place({ id: "c", sortOrder: 2 }),
    ];
    expect(hasDuplicateSortOrder(places)).toBe(true);
  });

  it("削除済み・Room の sortOrder は重複判定に含めない", () => {
    const places = [
      place({ id: "a", sortOrder: 1 }),
      place({ id: "b", sortOrder: 1, deletedAt: "2026-01-02T00:00:00Z" }),
      place({ id: "c", sortOrder: 1, type: "room", parentId: "bld-1" }),
    ];
    expect(hasDuplicateSortOrder(places)).toBe(false);
  });
});

describe("renumberByGeometry", () => {
  it("上（緯度降順）→左（経度昇順）の順で 0..N-1 を割り当てる", () => {
    const places = [
      place({ id: "sw", sortOrder: 9, coord: { lat: 35.0, lng: 140.0 } }),
      place({ id: "ne", sortOrder: 9, coord: { lat: 35.2, lng: 140.2 } }),
      place({ id: "nw", sortOrder: 9, coord: { lat: 35.2, lng: 140.0 } }),
      place({ id: "se", sortOrder: 9, coord: { lat: 35.0, lng: 140.2 } }),
    ];
    const changed = renumberByGeometry(places);
    const order = new Map(changed.map((p) => [p.id, p.sortOrder]));
    // nw(北・西)=0, ne(北・東)=1, sw(南・西)=2, se(南・東)=3
    expect(order.get("nw")).toBe(0);
    expect(order.get("ne")).toBe(1);
    expect(order.get("sw")).toBe(2);
    expect(order.get("se")).toBe(3);
  });

  it("緯度・経度が同一なら PlaceID 昇順で決定的に並ぶ", () => {
    const places = [
      place({ id: "b", sortOrder: 5 }),
      place({ id: "a", sortOrder: 5 }),
    ];
    const changed = renumberByGeometry(places);
    const order = new Map(changed.map((p) => [p.id, p.sortOrder]));
    expect(order.get("a")).toBe(0);
    expect(order.get("b")).toBe(1);
  });

  it("変更のあった場所だけを返す（無変更は保存対象外）", () => {
    const places = [
      place({ id: "n", sortOrder: 0, coord: { lat: 35.2, lng: 140.0 } }),
      place({ id: "s1", sortOrder: 1, coord: { lat: 35.0, lng: 140.0 } }),
      place({ id: "s2", sortOrder: 1, coord: { lat: 35.0, lng: 140.1 } }),
    ];
    // n=0（変更なし）, s1=1（変更なし）, s2=2（変更）
    const changed = renumberByGeometry(places);
    expect(changed.map((p) => p.id)).toEqual(["s2"]);
    expect(changed[0].sortOrder).toBe(2);
  });

  it("冪等: 再採番結果にもう一度かけても変更ゼロ", () => {
    const places = [
      place({ id: "a", sortOrder: 3, coord: { lat: 35.2, lng: 140.0 } }),
      place({ id: "b", sortOrder: 3, coord: { lat: 35.1, lng: 140.0 } }),
      place({ id: "c", sortOrder: 0, coord: { lat: 35.0, lng: 140.0 } }),
    ];
    const changed = renumberByGeometry(places);
    const byId = new Map(changed.map((p) => [p.id, p]));
    const applied = places.map((p) => byId.get(p.id) ?? p);
    expect(renumberByGeometry(applied)).toEqual([]);
  });

  it("削除済み・Room は再採番に含めない（元の sortOrder を保つ）", () => {
    const places = [
      place({ id: "a", sortOrder: 1, coord: { lat: 35.2, lng: 140.0 } }),
      place({ id: "b", sortOrder: 1, coord: { lat: 35.0, lng: 140.0 } }),
      place({
        id: "del",
        sortOrder: 9,
        deletedAt: "2026-01-02T00:00:00Z",
      }),
      place({ id: "room", sortOrder: 9, type: "room", parentId: "bld" }),
    ];
    // a=0（変更）, b=1（変更なし）。del / room は対象外で返却に含まれない。
    const changed = renumberByGeometry(places);
    expect(changed.map((p) => p.id)).toEqual(["a"]);
    expect(changed[0].sortOrder).toBe(0);
  });
});
