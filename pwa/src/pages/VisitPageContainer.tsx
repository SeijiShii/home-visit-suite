// desktop/frontend/src/pages/VisitPageContainer.tsx からの移植。
// Wails バインディングを useServices() のアダプタ・サービスに置き換えた。

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { VisitPage } from "./VisitPage";
import { RegionService } from "../services/region-service";
import { useIdentity } from "../contexts/IdentityContext";
import { useServices } from "../contexts/ServicesContext";
import { usePolygonEditor } from "../hooks/usePolygonEditor";
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
  const {
    placeService,
    visitService,
    settingsService,
    checkoutService,
    checkoutRepo,
    userRepo,
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

  // 現在のアクター DID を IdentityContext から取得（dev モードでは切替可能）。
  const { currentActorID: actorId } = useIdentity();

  // 区域レベルのアクセスモードと、他者がチェックアウト中ならその担当者名
  const [accessMode, setAccessMode] = useState<"editable" | "read_only">(
    "editable",
  );
  const [activeCheckoutOwnerName, setActiveCheckoutOwnerName] = useState<
    string | null
  >(null);
  const [accessTick, setAccessTick] = useState(0);

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

  // 区域アクセスモード + アクティブチェックアウトの担当者名を取得
  useEffect(() => {
    if (!actorId || !areaId) return;
    let cancelled = false;
    async function fetchAccess() {
      try {
        const mode = await checkoutService.areaAccessMode(actorId, areaId);
        if (cancelled) return;
        setAccessMode(mode === "read_only" ? "read_only" : "editable");

        // read-only のとき、他者が active チェックアウト中なら担当者名を取得
        if (mode === "read_only") {
          const co = await checkoutRepo.getActiveCheckout(areaId);
          if (cancelled) return;
          if (co && co.personInChargeId && co.personInChargeId !== actorId) {
            try {
              const u = await userRepo.getUser(co.personInChargeId);
              if (!cancelled) {
                setActiveCheckoutOwnerName(u?.name ?? co.personInChargeId);
              }
            } catch {
              if (!cancelled) setActiveCheckoutOwnerName(co.personInChargeId);
            }
          } else if (!cancelled) {
            setActiveCheckoutOwnerName(null);
          }
        } else if (!cancelled) {
          setActiveCheckoutOwnerName(null);
        }
      } catch (e) {
        console.error("VisitPageContainer access fetch failed", e);
      }
    }
    void fetchAccess();
    return () => {
      cancelled = true;
    };
  }, [actorId, areaId, accessTick, checkoutService, checkoutRepo, userRepo]);

  /** [この区域をチェックアウトして記録する] CTA: 自分自身を担当者にチェックアウト発行 */
  const handleSelfCheckout = useCallback(async () => {
    try {
      await checkoutService.checkout(actorId, areaId, actorId);
      setAccessTick((t) => t + 1);
    } catch (e) {
      console.error("self checkout failed", e);
      window.alert(String(e));
    }
  }, [actorId, areaId, checkoutService]);

  /** [強制回収して自分でチェックアウト] CTA: 強制回収 → 自分にチェックアウト */
  const handleForceReclaimAndSelfCheckout = useCallback(async () => {
    try {
      const co = await checkoutRepo.getActiveCheckout(areaId);
      if (co?.id) {
        await checkoutService.forceReturn(actorId, co.id);
      }
      await checkoutService.checkout(actorId, areaId, actorId);
      setAccessTick((t) => t + 1);
    } catch (e) {
      console.error("force reclaim failed", e);
      window.alert(String(e));
    }
  }, [actorId, areaId, checkoutService, checkoutRepo]);

  const editorReady = ready && editor;

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
      accessMode={accessMode}
      activeCheckoutOwnerName={activeCheckoutOwnerName}
      onSelfCheckout={handleSelfCheckout}
      onForceReclaimAndSelfCheckout={handleForceReclaimAndSelfCheckout}
    />
  );
}
