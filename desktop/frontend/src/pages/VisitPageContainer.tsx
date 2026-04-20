import { useMemo } from "react";
import { VisitPage } from "./VisitPage";
import { PlaceService, type PlaceBindingAPI } from "../services/place-service";
import {
  VisitService,
  type VisitBindingAPI,
} from "../services/visit-service";
import * as PlaceBinding from "../../wailsjs/go/binding/PlaceBinding";
import * as VisitBinding from "../../wailsjs/go/binding/VisitBinding";

/**
 * Phase 1 暫定: チェックアウトモデル未設計のため
 * ポリゴン紐付け済みの NRT-001-01 へ固定遷移する。
 * 仕様 docs/wants/08_活動メンバー向けアプリ.md「訪問記録画面」
 */
const PHASE1_AREA_ID = "NRT-001-01";

export function VisitPageContainer() {
  const placeService = useMemo(
    () => new PlaceService(PlaceBinding as unknown as PlaceBindingAPI),
    [],
  );
  const visitService = useMemo(
    () => new VisitService(VisitBinding as unknown as VisitBindingAPI),
    [],
  );

  // TODO: 自分の DID を SettingsService 等から取得する。
  // 現状は空文字（バックエンド側で actor 検証は未実装のため動作はする）。
  const actorId = "";

  return (
    <VisitPage
      areaId={PHASE1_AREA_ID}
      actorId={actorId}
      placeService={placeService}
      visitService={visitService}
      onPlaceCreateRequest={(args) => {
        console.log("[VisitPage] place create request:", args);
        // TODO: Slice 10 で RequestService 経由で永続化する
      }}
      onPlaceModifyRequest={(placeId, text) => {
        console.log("[VisitPage] place modify request:", placeId, text);
        // TODO: Slice 10 で RequestService 経由で永続化する
      }}
    />
  );
}
