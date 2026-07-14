// desktop/frontend/src/pages/VisitPageContainer.tsx からの移植。
// Wails バインディングを useServices() のアダプタ・サービスに置き換えた。

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Navigate,
  useLocation,
  useNavigate,
  useParams,
} from "react-router-dom";
import { VisitPage } from "./VisitPage";
import { RegionService } from "../services/region-service";
import { isRoleAtLeast, useIdentity } from "../contexts/IdentityContext";
import { useServices } from "../contexts/ServicesContext";
import { usePolygonEditor } from "../hooks/usePolygonEditor";
import { useTouchPrimary } from "../hooks/useMediaQuery";
import { buildPolygonAreaMap } from "../services/polygon-service";
import { newId } from "../services/id";
import type { Request, RequestType } from "../domain/models/request";
import type { PlaceEditRequestKind } from "../components/VisitRecordDialog";

/** 編集リクエストの種別 → RequestType（docs/wants/07「場所操作の権限」） */
function editRequestType(kind: PlaceEditRequestKind): RequestType {
  switch (kind) {
    case "delete":
      return "place_delete";
    case "move":
      return "place_move";
    case "other":
      return "place_info_modify";
  }
}

/**
 * 訪問記録画面のコンテナ。
 * ルート /visits/:areaId の areaId を対象区域とする（未指定時は空）。
 * 仕様 docs/wants/08_活動メンバー向けアプリ.md「訪問記録画面」
 */
export function VisitPageContainer() {
  const { areaId = "" } = useParams<{ areaId: string }>();
  // 区域編集画面から遷移してきた場合のみ「区域編集に戻る」ボタンを出す
  // （docs/wants/03「場所の直接編集」。ダッシュボード起点では出さない）。
  const location = useLocation();
  const navigate = useNavigate();
  const fromMapEditor =
    (location.state as { from?: string } | null)?.from === "map-editor";
  const handleBackToMap = useCallback(() => navigate("/map"), [navigate]);
  const {
    placeService,
    visitService,
    settingsService,
    checkoutService,
    notificationRepo,
    regionBindingApi,
    mapBinding,
  } = useServices();

  const regionService = useMemo(
    () => new RegionService(regionBindingApi),
    [regionBindingApi],
  );
  const { editor, ready } = usePolygonEditor(mapBinding, regionBindingApi);
  const [polygonToArea, setPolygonToArea] = useState<Map<string, string>>(
    new Map(),
  );
  const [linkedPolygonIds, setLinkedPolygonIds] = useState<Set<string>>(
    new Set(),
  );

  // 現在のアクター DID とロールを IdentityContext から取得（dev モードでは切替可能）。
  const { currentActorID: actorId, currentRole } = useIdentity();

  // 場所の直接編集権限 = 編集メンバー以上 × 非タッチ端末
  // （docs/wants/07_通知と申請.md「場所操作の権限」）
  const touchPrimary = useTouchPrimary();
  const isEditorOrAbove = isRoleAtLeast(currentRole, "editor");
  const canDirectEdit = isEditorOrAbove && !touchPrimary;

  // 活動メンバーのアクセス可否（自分の active チェックアウト or 有効な区域招待）。
  // 区域レベル read-only の画面内 UI は 2026-07-14 廃止のため、判定はルート
  // ブロック（ダッシュボードへのリダイレクト）にのみ使う。
  // 仕様 docs/wants/05_チェックアウト.md「アクセスモード」/ 08「アクセス条件」
  const [accessDenied, setAccessDenied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    regionService.loadTree().then((tree) => {
      if (cancelled) return;
      const areaMap = buildPolygonAreaMap(tree);
      const m = new Map<string, string>();
      for (const [polyId, info] of areaMap) m.set(polyId, info.areaId);
      setPolygonToArea(m);
      setLinkedPolygonIds(new Set(m.keys()));
    });
    return () => {
      cancelled = true;
    };
  }, [regionService]);

  // 活動メンバーのみアクセス判定を取得する（編集メンバー以上は常時アクセス可）
  useEffect(() => {
    if (isEditorOrAbove || !actorId || !areaId) return;
    let cancelled = false;
    checkoutService
      .areaAccessMode(actorId, areaId)
      .then((mode) => {
        if (!cancelled) setAccessDenied(mode === "read_only");
      })
      .catch((e) => {
        console.error("VisitPageContainer access fetch failed", e);
      });
    return () => {
      cancelled = true;
    };
  }, [isEditorOrAbove, actorId, areaId, checkoutService]);

  const editorReady = ready && editor;

  // 活動メンバーは「自分の active チェックアウト or 有効な区域招待」がある区域のみ
  // アクセス可。満たさない場合はルートをブロックしダッシュボードへ戻す。
  // 仕様 docs/wants/08_活動メンバー向けアプリ.md「アクセス条件」
  if (!isEditorOrAbove && accessDenied) {
    return <Navigate to="/" replace />;
  }

  return (
    <VisitPage
      areaId={areaId}
      actorId={actorId}
      placeService={placeService}
      visitService={visitService}
      editor={editorReady ? editor : undefined}
      polygonToArea={editorReady ? polygonToArea : undefined}
      linkedPolygonIds={editorReady ? linkedPolygonIds : undefined}
      settingsService={settingsService}
      onPlaceEditRequest={(placeId, kind, text) => {
        // 編集対象の placeId + areaId を保持して発行する。これにより
        // タスク一覧（RequestsPage）から当該場所の編集画面へ遷移できる。
        // 要削除(place_delete) / 要移動(place_move) / その他(place_info_modify)
        // 仕様 docs/wants/07_通知と申請.md「場所操作の権限」
        const req: Request = {
          id: newId("req"),
          type: editRequestType(kind),
          status: "pending",
          submitterId: actorId,
          areaId,
          placeId,
          coord: null,
          description: text,
          createdAt: new Date().toISOString(),
          resolvedAt: null,
          resolvedBy: "",
        };
        void notificationRepo.saveRequest(req).catch((e) => {
          console.error("[VisitPage] saveRequest (edit) failed", e);
        });
      }}
      canDirectEdit={canDirectEdit}
      onBackToMap={fromMapEditor ? handleBackToMap : undefined}
    />
  );
}
