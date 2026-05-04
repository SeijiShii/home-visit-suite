import { useCallback, useEffect, useMemo, useState } from "react";
import { VisitPage } from "./VisitPage";
import { PlaceService, type PlaceBindingAPI } from "../services/place-service";
import { VisitService, type VisitBindingAPI } from "../services/visit-service";
import { RegionService } from "../services/region-service";
import { SettingsService } from "../services/settings-service";
import { useIdentity } from "../contexts/IdentityContext";
import { usePolygonEditor } from "../hooks/usePolygonEditor";
import { buildPolygonAreaMap } from "../services/polygon-service";
import * as PlaceBinding from "../../wailsjs/go/binding/PlaceBinding";
import * as VisitBinding from "../../wailsjs/go/binding/VisitBinding";
import * as RegionBinding from "../../wailsjs/go/binding/RegionBinding";
import * as MapBinding from "../../wailsjs/go/binding/MapBinding";
import * as SettingsBinding from "../../wailsjs/go/binding/SettingsBinding";
import * as CheckoutBinding from "../../wailsjs/go/binding/CheckoutBinding";
import * as UserBinding from "../../wailsjs/go/binding/UserBinding";

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
  const regionService = useMemo(() => new RegionService(RegionBinding), []);
  const settingsService = useMemo(
    () => new SettingsService(SettingsBinding),
    [],
  );
  const regionAPI = useMemo(
    () => ({
      BindPolygonToArea: RegionBinding.BindPolygonToArea,
      UnbindPolygonFromArea: RegionBinding.UnbindPolygonFromArea,
    }),
    [],
  );
  const { editor, ready } = usePolygonEditor(MapBinding, regionAPI);
  const [polygonToArea, setPolygonToArea] = useState<Map<string, string>>(
    new Map(),
  );
  const [linkedPolygonIds, setLinkedPolygonIds] = useState<Set<string>>(
    new Set(),
  );

  // 現在のアクター DID を IdentityContext から取得（dev モードでは切替可能）。
  const { currentActorID: actorId } = useIdentity();

  // Phase G7: 区域レベルのアクセスモードと、他者がチェックアウト中ならその担当者名
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
    if (!actorId) return;
    let cancelled = false;
    async function fetchAccess() {
      try {
        const mode = await CheckoutBinding.AreaAccessMode(
          actorId,
          PHASE1_AREA_ID,
        );
        if (cancelled) return;
        setAccessMode(mode === "read_only" ? "read_only" : "editable");

        // read-only のとき、他者が active チェックアウト中なら担当者名を取得
        if (mode === "read_only") {
          const co = await CheckoutBinding.GetActiveCheckout(PHASE1_AREA_ID);
          if (cancelled) return;
          if (co && co.ownerId && co.ownerId !== actorId) {
            try {
              const u = await UserBinding.GetUser(co.ownerId);
              if (!cancelled) {
                setActiveCheckoutOwnerName(u?.name ?? co.ownerId);
              }
            } catch {
              if (!cancelled) setActiveCheckoutOwnerName(co.ownerId);
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
  }, [actorId, accessTick]);

  /** [この区域をチェックアウトして記録する] CTA: 自分自身に lending を発行 */
  const handleSelfCheckout = useCallback(async () => {
    try {
      await CheckoutBinding.Checkout(actorId, PHASE1_AREA_ID, "lending", actorId);
      setAccessTick((t) => t + 1);
    } catch (e) {
      console.error("self checkout failed", e);
      window.alert(String(e));
    }
  }, [actorId]);

  /** [強制回収して自分でチェックアウト] CTA: 強制回収 → 自分に lending */
  const handleForceReclaimAndSelfCheckout = useCallback(async () => {
    try {
      const co = await CheckoutBinding.GetActiveCheckout(PHASE1_AREA_ID);
      if (co?.id) {
        await CheckoutBinding.ForceReturn(actorId, co.id);
      }
      await CheckoutBinding.Checkout(actorId, PHASE1_AREA_ID, "lending", actorId);
      setAccessTick((t) => t + 1);
    } catch (e) {
      console.error("force reclaim failed", e);
      window.alert(String(e));
    }
  }, [actorId]);

  const editorReady = ready && editor;

  return (
    <VisitPage
      areaId={PHASE1_AREA_ID}
      actorId={actorId}
      placeService={placeService}
      visitService={visitService}
      editor={editorReady ? editor : undefined}
      polygonToArea={editorReady ? polygonToArea : undefined}
      linkedPolygonIds={editorReady ? linkedPolygonIds : undefined}
      settingsService={settingsService}
      onPlaceCreateRequest={(args) => {
        console.log("[VisitPage] place create request:", args);
        // TODO: Slice 10 で RequestService 経由で永続化する
      }}
      onPlaceModifyRequest={(placeId, text) => {
        console.log("[VisitPage] place modify request:", placeId, text);
        // TODO: Slice 10 で RequestService 経由で永続化する
      }}
      accessMode={accessMode}
      activeCheckoutOwnerName={activeCheckoutOwnerName}
      onSelfCheckout={handleSelfCheckout}
      onForceReclaimAndSelfCheckout={handleForceReclaimAndSelfCheckout}
    />
  );
}
