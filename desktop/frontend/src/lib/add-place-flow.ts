import { findNearbyDeletedPlace, type PlaceLike } from "./area-detail-geo";

/**
 * 区域詳細編集モードでの「家を追加」フロー状態機械。
 * 仕様: docs/wants/03_地図機能.md「場所の論理削除と訪問記録の紐付け」
 *
 * 流れ:
 *   idle
 *    └ open(lat,lng) → confirmingRestore (削除済み <=5m あり) または ready
 *   ready                       → commit() で作成 (RestoredFromID なし)
 *   confirmingRestore           → restore(yes/no) で作成 (yes なら RestoredFromID 付き)
 *   * 任意の状態で cancel() → idle
 *
 * 純粋なリデューサとして実装し、副作用 (PlaceService 呼び出し) は呼び出し側に委ねる。
 */

export type AddPlaceFlowState =
  | { kind: "idle" }
  | { kind: "ready"; lat: number; lng: number }
  | {
      kind: "confirmingRestore";
      lat: number;
      lng: number;
      restoredFromId: string;
    };

export type AddPlaceFlowAction =
  | { type: "open"; lat: number; lng: number; nearbyDeleted: PlaceLike[] }
  | { type: "cancel" }
  | { type: "restoreYes" }
  | { type: "restoreNo" };

export interface AddPlaceCommitArgs {
  lat: number;
  lng: number;
  /** 削除済み場所と紐付ける場合のみ設定される */
  restoredFromId?: string;
}

/** 5m 以内に削除済みがあれば最も近いものに紐付け確認、なければ即 ready。 */
export const ADD_PLACE_RESTORE_RADIUS_M = 5;

export function addPlaceFlowReducer(
  state: AddPlaceFlowState,
  action: AddPlaceFlowAction,
): AddPlaceFlowState {
  switch (action.type) {
    case "open": {
      const nearby = findNearbyDeletedPlace(
        { lat: action.lat, lng: action.lng },
        action.nearbyDeleted,
        ADD_PLACE_RESTORE_RADIUS_M,
      );
      if (nearby) {
        return {
          kind: "confirmingRestore",
          lat: action.lat,
          lng: action.lng,
          restoredFromId: nearby.id,
        };
      }
      return { kind: "ready", lat: action.lat, lng: action.lng };
    }
    case "cancel":
      return { kind: "idle" };
    case "restoreYes":
      if (state.kind !== "confirmingRestore") return state;
      // restoreYes は commit を呼ばずに状態を ready に保持しても良いが、
      // ここでは「ユーザーが yes を選んだ」事実を呼び出し側で commit するため
      // ready 相当の状態に遷移させる。RestoredFromID は selectCommit() で取得。
      return state;
    case "restoreNo":
      if (state.kind !== "confirmingRestore") return state;
      return state;
    default:
      return state;
  }
}

/**
 * 現在の状態と yes/no 選択から、PlaceService に渡す commit 引数を導出する。
 * idle / confirmingRestore で choice が未確定なら null。
 */
export function selectCommit(
  state: AddPlaceFlowState,
  restoreChoice?: "yes" | "no",
): AddPlaceCommitArgs | null {
  if (state.kind === "ready") {
    return { lat: state.lat, lng: state.lng };
  }
  if (state.kind === "confirmingRestore") {
    if (restoreChoice === "yes") {
      return {
        lat: state.lat,
        lng: state.lng,
        restoredFromId: state.restoredFromId,
      };
    }
    if (restoreChoice === "no") {
      return { lat: state.lat, lng: state.lng };
    }
  }
  return null;
}
