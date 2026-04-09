import { describe, it, expect } from "vitest";
import {
  addPlaceFlowReducer,
  selectCommit,
  ADD_PLACE_RESTORE_RADIUS_M,
  type AddPlaceFlowState,
} from "./add-place-flow";
import type { PlaceLike } from "./area-detail-geo";

const idle: AddPlaceFlowState = { kind: "idle" };

describe("addPlaceFlowReducer", () => {
  it("open: 近傍に削除済みが無ければ ready へ", () => {
    const next = addPlaceFlowReducer(idle, {
      type: "open",
      lat: 35.776,
      lng: 140.318,
      nearbyDeleted: [],
    });
    expect(next).toEqual({ kind: "ready", lat: 35.776, lng: 140.318 });
  });

  it("open: 5m 以内に削除済みがあれば confirmingRestore へ (最近傍を採用)", () => {
    // 35.776, 140.318 から 約 1.4m と 約 4m の 2 点
    const deleted: PlaceLike[] = [
      {
        id: "near-far",
        lat: 35.77603,
        lng: 140.318,
        deletedAt: "2026-01-01T00:00:00Z",
      },
      {
        id: "near-close",
        lat: 35.776009,
        lng: 140.318,
        deletedAt: "2026-01-01T00:00:00Z",
      },
    ];
    const next = addPlaceFlowReducer(idle, {
      type: "open",
      lat: 35.776,
      lng: 140.318,
      nearbyDeleted: deleted,
    });
    expect(next.kind).toBe("confirmingRestore");
    if (next.kind === "confirmingRestore") {
      expect(next.restoredFromId).toBe("near-close");
    }
  });

  it("open: 削除済みでも 5m を超えたら ready", () => {
    // 約 11m
    const deleted: PlaceLike[] = [
      {
        id: "x",
        lat: 35.7761,
        lng: 140.318,
        deletedAt: "2026-01-01T00:00:00Z",
      },
    ];
    const next = addPlaceFlowReducer(idle, {
      type: "open",
      lat: 35.776,
      lng: 140.318,
      nearbyDeleted: deleted,
    });
    expect(next.kind).toBe("ready");
  });

  it("cancel: 任意の状態から idle へ", () => {
    const ready: AddPlaceFlowState = { kind: "ready", lat: 1, lng: 2 };
    expect(addPlaceFlowReducer(ready, { type: "cancel" })).toEqual(idle);
    const conf: AddPlaceFlowState = {
      kind: "confirmingRestore",
      lat: 1,
      lng: 2,
      restoredFromId: "p",
    };
    expect(addPlaceFlowReducer(conf, { type: "cancel" })).toEqual(idle);
  });

  it("ADD_PLACE_RESTORE_RADIUS_M は仕様通り 5m", () => {
    expect(ADD_PLACE_RESTORE_RADIUS_M).toBe(5);
  });
});

describe("selectCommit", () => {
  it("ready: そのまま座標を返す (restoredFromId なし)", () => {
    expect(
      selectCommit({ kind: "ready", lat: 35, lng: 140 }),
    ).toEqual({ lat: 35, lng: 140 });
  });

  it("confirmingRestore + yes: restoredFromId を付与", () => {
    expect(
      selectCommit(
        {
          kind: "confirmingRestore",
          lat: 35,
          lng: 140,
          restoredFromId: "old-1",
        },
        "yes",
      ),
    ).toEqual({ lat: 35, lng: 140, restoredFromId: "old-1" });
  });

  it("confirmingRestore + no: restoredFromId 無しで作成", () => {
    expect(
      selectCommit(
        {
          kind: "confirmingRestore",
          lat: 35,
          lng: 140,
          restoredFromId: "old-1",
        },
        "no",
      ),
    ).toEqual({ lat: 35, lng: 140 });
  });

  it("confirmingRestore + 未選択: null", () => {
    expect(
      selectCommit({
        kind: "confirmingRestore",
        lat: 35,
        lng: 140,
        restoredFromId: "old-1",
      }),
    ).toBeNull();
  });

  it("idle: null", () => {
    expect(selectCommit({ kind: "idle" })).toBeNull();
  });
});
