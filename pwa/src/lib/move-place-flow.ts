import {
  findNearbyDeletedPlace,
  type PlaceLike,
} from "./area-detail-geo";
import { ADD_PLACE_RESTORE_RADIUS_M } from "./add-place-flow";

/**
 * 場所マーカー移動フローの純状態機械。
 * 仕様: docs/wants/03_地図機能.md「区域詳細編集モード / 場所操作」
 *
 *   idle
 *    └ start(placeId)        → tracking (lat/lng は updatePosition で随時更新)
 *   tracking
 *    ├ updatePosition         → tracking
 *    ├ cancel                 → idle (元の位置へ戻すかは呼び出し側で復元)
 *    └ confirm(nearbyDeleted) → confirmingRestore (5m 以内に削除済み) / committed
 *   confirmingRestore
 *    ├ restoreYes             → committed (RestoredFromID 付き)
 *    ├ restoreNo              → committed (RestoredFromID なし)
 *    └ cancel                 → idle
 *   committed                 → 呼び出し側が PlaceService.savePlace を呼び reset() で idle へ
 *
 * 移動中は呼び出し側で地図ドラッグを無効化すること。
 */

export type MovePlaceFlowState =
  | { kind: "idle" }
  | { kind: "tracking"; placeId: string; lat: number; lng: number }
  | {
      kind: "confirmingRestore";
      placeId: string;
      lat: number;
      lng: number;
      restoredFromId: string;
    }
  | {
      kind: "committed";
      placeId: string;
      lat: number;
      lng: number;
      restoredFromId?: string;
    };

export type MovePlaceFlowAction =
  | { type: "start"; placeId: string; lat: number; lng: number }
  | { type: "updatePosition"; lat: number; lng: number }
  | { type: "cancel" }
  | { type: "confirm"; nearbyDeleted: PlaceLike[] }
  | { type: "restoreYes" }
  | { type: "restoreNo" }
  | { type: "reset" };

export interface MovePlaceCommitArgs {
  placeId: string;
  lat: number;
  lng: number;
  restoredFromId?: string;
}

export function movePlaceFlowReducer(
  state: MovePlaceFlowState,
  action: MovePlaceFlowAction,
): MovePlaceFlowState {
  switch (action.type) {
    case "start":
      return {
        kind: "tracking",
        placeId: action.placeId,
        lat: action.lat,
        lng: action.lng,
      };
    case "updatePosition":
      if (state.kind !== "tracking") return state;
      return { ...state, lat: action.lat, lng: action.lng };
    case "cancel":
      return { kind: "idle" };
    case "confirm": {
      if (state.kind !== "tracking") return state;
      const nearby = findNearbyDeletedPlace(
        { lat: state.lat, lng: state.lng },
        action.nearbyDeleted.filter((p) => p.id !== state.placeId),
        ADD_PLACE_RESTORE_RADIUS_M,
      );
      if (nearby) {
        return {
          kind: "confirmingRestore",
          placeId: state.placeId,
          lat: state.lat,
          lng: state.lng,
          restoredFromId: nearby.id,
        };
      }
      return {
        kind: "committed",
        placeId: state.placeId,
        lat: state.lat,
        lng: state.lng,
      };
    }
    case "restoreYes":
      if (state.kind !== "confirmingRestore") return state;
      return {
        kind: "committed",
        placeId: state.placeId,
        lat: state.lat,
        lng: state.lng,
        restoredFromId: state.restoredFromId,
      };
    case "restoreNo":
      if (state.kind !== "confirmingRestore") return state;
      return {
        kind: "committed",
        placeId: state.placeId,
        lat: state.lat,
        lng: state.lng,
      };
    case "reset":
      return { kind: "idle" };
    default:
      return state;
  }
}

export function selectMoveCommit(
  state: MovePlaceFlowState,
): MovePlaceCommitArgs | null {
  if (state.kind !== "committed") return null;
  return {
    placeId: state.placeId,
    lat: state.lat,
    lng: state.lng,
    restoredFromId: state.restoredFromId,
  };
}
