import { describe, it, expect } from "vitest";
import {
  movePlaceFlowReducer,
  selectMoveCommit,
  type MovePlaceFlowState,
} from "./move-place-flow";
import type { PlaceLike } from "./area-detail-geo";

const idle: MovePlaceFlowState = { kind: "idle" };

describe("movePlaceFlowReducer", () => {
  it("start: tracking へ", () => {
    const next = movePlaceFlowReducer(idle, {
      type: "start",
      placeId: "p1",
      lat: 35.776,
      lng: 140.318,
    });
    expect(next).toEqual({
      kind: "tracking",
      placeId: "p1",
      lat: 35.776,
      lng: 140.318,
    });
  });

  it("updatePosition: tracking 中だけ座標を更新", () => {
    const tracking: MovePlaceFlowState = {
      kind: "tracking",
      placeId: "p1",
      lat: 0,
      lng: 0,
    };
    expect(
      movePlaceFlowReducer(tracking, {
        type: "updatePosition",
        lat: 1,
        lng: 2,
      }),
    ).toEqual({ kind: "tracking", placeId: "p1", lat: 1, lng: 2 });
    // idle 状態では無視
    expect(
      movePlaceFlowReducer(idle, { type: "updatePosition", lat: 1, lng: 2 }),
    ).toEqual(idle);
  });

  it("confirm: 5m 以内に削除済みなし → committed", () => {
    const tracking: MovePlaceFlowState = {
      kind: "tracking",
      placeId: "p1",
      lat: 35.776,
      lng: 140.318,
    };
    const next = movePlaceFlowReducer(tracking, {
      type: "confirm",
      nearbyDeleted: [],
    });
    expect(next.kind).toBe("committed");
    if (next.kind === "committed") {
      expect(next.placeId).toBe("p1");
      expect(next.restoredFromId).toBeUndefined();
    }
  });

  it("confirm: 5m 以内に削除済みあり → confirmingRestore (自身は除外)", () => {
    const tracking: MovePlaceFlowState = {
      kind: "tracking",
      placeId: "p1",
      lat: 35.776,
      lng: 140.318,
    };
    const deleted: PlaceLike[] = [
      // 自身 (除外されるべき)
      {
        id: "p1",
        lat: 35.776,
        lng: 140.318,
        deletedAt: "2026-01-01T00:00:00Z",
      },
      // 約 1m
      {
        id: "old-1",
        lat: 35.776009,
        lng: 140.318,
        deletedAt: "2026-01-01T00:00:00Z",
      },
    ];
    const next = movePlaceFlowReducer(tracking, {
      type: "confirm",
      nearbyDeleted: deleted,
    });
    expect(next.kind).toBe("confirmingRestore");
    if (next.kind === "confirmingRestore") {
      expect(next.restoredFromId).toBe("old-1");
    }
  });

  it("restoreYes / restoreNo: confirmingRestore → committed", () => {
    const conf: MovePlaceFlowState = {
      kind: "confirmingRestore",
      placeId: "p1",
      lat: 1,
      lng: 2,
      restoredFromId: "old",
    };
    const yes = movePlaceFlowReducer(conf, { type: "restoreYes" });
    expect(yes).toMatchObject({
      kind: "committed",
      placeId: "p1",
      restoredFromId: "old",
    });
    const no = movePlaceFlowReducer(conf, { type: "restoreNo" });
    expect(no).toMatchObject({ kind: "committed", placeId: "p1" });
    if (no.kind === "committed") expect(no.restoredFromId).toBeUndefined();
  });

  it("cancel: 任意の状態から idle へ", () => {
    const tracking: MovePlaceFlowState = {
      kind: "tracking",
      placeId: "p1",
      lat: 1,
      lng: 2,
    };
    expect(movePlaceFlowReducer(tracking, { type: "cancel" })).toEqual(idle);
    const conf: MovePlaceFlowState = {
      kind: "confirmingRestore",
      placeId: "p1",
      lat: 1,
      lng: 2,
      restoredFromId: "old",
    };
    expect(movePlaceFlowReducer(conf, { type: "cancel" })).toEqual(idle);
  });

  it("reset: committed → idle", () => {
    const c: MovePlaceFlowState = {
      kind: "committed",
      placeId: "p1",
      lat: 1,
      lng: 2,
    };
    expect(movePlaceFlowReducer(c, { type: "reset" })).toEqual(idle);
  });
});

describe("selectMoveCommit", () => {
  it("committed のときのみ commit 引数を返す", () => {
    expect(selectMoveCommit(idle)).toBeNull();
    expect(
      selectMoveCommit({
        kind: "tracking",
        placeId: "p1",
        lat: 1,
        lng: 2,
      }),
    ).toBeNull();
    expect(
      selectMoveCommit({
        kind: "committed",
        placeId: "p1",
        lat: 1,
        lng: 2,
        restoredFromId: "old",
      }),
    ).toEqual({ placeId: "p1", lat: 1, lng: 2, restoredFromId: "old" });
  });
});
