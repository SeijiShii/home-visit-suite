import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useI18n } from "../contexts/I18nContext";
import { RegionService } from "../services/region-service";
import type { PlaceService, PlaceType } from "../services/place-service";
import type { SettingsService } from "../services/settings-service";
import { MapView, type MapViewHandle } from "../components/MapView";
import { AreaDetailContextMenu } from "../components/AreaDetailContextMenu";
import * as RegionBinding from "../../wailsjs/go/binding/RegionBinding";
import { formatAreaLabel } from "../lib/area-detail-geo";
import {
  buildAreaDetailViewModel,
  polygonCentersFromEditor,
  type PolygonGeoSource,
} from "../lib/area-detail-controller";
import { applyDetailViewModelToMap } from "../lib/area-detail-map-integration";
import {
  addPlaceFlowReducer,
  selectCommit,
  ADD_PLACE_RESTORE_RADIUS_M,
  type AddPlaceCommitArgs,
  type AddPlaceFlowState,
} from "../lib/add-place-flow";
import type { NetworkPolygonEditor } from "map-polygon-editor";

export interface AreaDetailEditPageProps {
  /** テスト用に注入可能。未指定なら本番 RegionBinding を使う。 */
  regionService?: RegionService;
  /** 未指定ならプレースホルダ div のみ描画 (テスト経路)。 */
  editor?: NetworkPolygonEditor | PolygonGeoSource;
  /** polygonId → areaId の紐付け表。editor 指定時に必須。 */
  polygonToArea?: ReadonlyMap<string, string>;
  /** 対象区域の場所取得。未指定なら場所は描画しない。 */
  placeService?: PlaceService;
  /** ui.areaDetailRadiusKm の取得。未指定なら既定 5km。 */
  settingsService?: SettingsService;
  /** 初期リンク済みポリゴン ID 集合 (renderAll 用)。 */
  linkedPolygonIds?: Set<string>;
  /** 家を追加 commit の副作用フック。指定時はこちらが優先される。 */
  onCommitAddPlace?: (args: AddPlaceCommitArgs) => Promise<void> | void;
}

type ContextMenuState =
  | null
  | { variant: "blank"; x: number; y: number; lat: number; lng: number };

const initialFlow: AddPlaceFlowState = { kind: "idle" };

export function AreaDetailEditPage({
  regionService,
  editor,
  polygonToArea,
  placeService,
  settingsService,
  linkedPolygonIds,
  onCommitAddPlace,
}: AreaDetailEditPageProps = {}) {
  const { t } = useI18n();
  const navigate = useNavigate();
  const { areaId = "" } = useParams<{ areaId: string }>();
  const service = useMemo(
    () => regionService ?? new RegionService(RegionBinding),
    [regionService],
  );
  const [label, setLabel] = useState<string | null>(null);
  const mapRef = useRef<MapViewHandle>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [contextMenu, setContextMenu] = useState<ContextMenuState>(null);
  const [flow, dispatchFlow] = useReducer(addPlaceFlowReducer, initialFlow);

  useEffect(() => {
    let cancelled = false;
    service.loadTree().then((tree) => {
      if (cancelled) return;
      setLabel(formatAreaLabel(tree, areaId));
    });
    return () => {
      cancelled = true;
    };
  }, [service, areaId]);

  // --- 地図への ViewModel 適用 (editor 提供時のみ) ---
  useEffect(() => {
    if (!editor || !polygonToArea) return;
    const handle = mapRef.current;
    if (!handle) return;
    let cancelled = false;

    const run = async () => {
      handle.setEditor(editor as NetworkPolygonEditor);
      const centers = polygonCentersFromEditor(editor);
      const radiusKm =
        (await settingsService?.getAreaDetailRadiusKm().catch(() => 5)) ?? 5;
      const places = placeService
        ? await placeService.listPlaces(areaId).catch(() => [])
        : [];
      if (cancelled) return;
      const viewportPx = containerRef.current?.clientWidth || 800;
      const vm = buildAreaDetailViewModel({
        polygonCenters: centers,
        polygonToArea,
        targetAreaId: areaId,
        places: places.map((p) => ({
          id: p.id,
          lat: p.coord.lat,
          lng: p.coord.lng,
          deletedAt: p.deletedAt ?? null,
        })),
        radiusKm,
        viewportPx,
      });
      if (!vm || cancelled) return;
      const linked = linkedPolygonIds ?? new Set<string>();
      applyDetailViewModelToMap(
        handle,
        vm,
        places.map((p) => ({
          id: p.id,
          lat: p.coord.lat,
          lng: p.coord.lng,
          type: p.type as PlaceType,
        })),
        linked,
      );
    };
    run();
    return () => {
      cancelled = true;
    };
  }, [
    editor,
    polygonToArea,
    placeService,
    settingsService,
    areaId,
    linkedPolygonIds,
  ]);

  const handleMapContextMenu = useCallback(
    (lat: number, lng: number, x: number, y: number) => {
      setContextMenu({ variant: "blank", lat, lng, x, y });
    },
    [],
  );

  const commit = useCallback(
    async (args: AddPlaceCommitArgs) => {
      if (onCommitAddPlace) {
        await onCommitAddPlace(args);
        return;
      }
      // 既定: PlaceService.savePlace を最小フィールドで呼ぶ
      if (!placeService) return;
      await placeService.savePlace({
        id: "",
        areaId,
        coord: { lat: args.lat, lng: args.lng },
        type: "house",
        label: "",
        displayName: "",
        parentId: "",
        sortOrder: 0,
        languages: [],
        doNotVisit: false,
        doNotVisitNote: "",
        createdAt: "",
        updatedAt: "",
        deletedAt: null,
        restoredFromId: args.restoredFromId ?? null,
      });
    },
    [onCommitAddPlace, placeService, areaId],
  );

  const handleAddHouse = useCallback(async () => {
    if (!contextMenu || contextMenu.variant !== "blank") return;
    const { lat, lng } = contextMenu;
    setContextMenu(null);
    const nearby = placeService
      ? await placeService
          .listDeletedPlacesNear(lat, lng, ADD_PLACE_RESTORE_RADIUS_M)
          .catch(() => [])
      : [];
    dispatchFlow({
      type: "open",
      lat,
      lng,
      nearbyDeleted: nearby.map((p) => ({
        id: p.id,
        lat: p.coord.lat,
        lng: p.coord.lng,
        deletedAt: p.deletedAt ?? null,
      })),
    });
  }, [contextMenu, placeService]);

  // ready 状態に来たら即 commit (確認不要パス)
  useEffect(() => {
    if (flow.kind !== "ready") return;
    let cancelled = false;
    (async () => {
      const args = selectCommit(flow);
      if (!args || cancelled) return;
      await commit(args);
      dispatchFlow({ type: "cancel" });
    })();
    return () => {
      cancelled = true;
    };
  }, [flow, commit]);

  const handleRestoreYes = useCallback(async () => {
    if (flow.kind !== "confirmingRestore") return;
    const args = selectCommit(flow, "yes");
    if (args) await commit(args);
    dispatchFlow({ type: "cancel" });
  }, [flow, commit]);

  const handleRestoreNo = useCallback(async () => {
    if (flow.kind !== "confirmingRestore") return;
    const args = selectCommit(flow, "no");
    if (args) await commit(args);
    dispatchFlow({ type: "cancel" });
  }, [flow, commit]);

  const mapEnabled = Boolean(editor && polygonToArea);

  return (
    <div className="area-detail-edit-page">
      <div className="area-detail-topbar">
        <button
          className="area-detail-back-btn"
          onClick={() => navigate(-1)}
          aria-label={t.areaDetail.back}
        >
          ← {t.areaDetail.back}
        </button>
        <span className="area-detail-label">{label ?? t.areaDetail.title}</span>
      </div>
      <div
        ref={containerRef}
        className="area-detail-map"
        data-testid="area-detail-map"
      >
        {mapEnabled && (
          <MapView ref={mapRef} onContextMenu={handleMapContextMenu} />
        )}
        {contextMenu && (
          <AreaDetailContextMenu
            x={contextMenu.x}
            y={contextMenu.y}
            variant={contextMenu.variant}
            onAddHouse={handleAddHouse}
            onClose={() => setContextMenu(null)}
          />
        )}
      </div>
      {flow.kind === "confirmingRestore" && (
        <div
          role="dialog"
          aria-label={t.areaDetail.linkRestoredPrompt}
          className="area-detail-restore-dialog"
        >
          <p>{t.areaDetail.linkRestoredPrompt}</p>
          <button onClick={handleRestoreYes}>{t.areaDetail.yes}</button>
          <button onClick={handleRestoreNo}>{t.areaDetail.no}</button>
        </div>
      )}
    </div>
  );
}
