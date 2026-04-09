import {
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useI18n } from "../contexts/I18nContext";
import { RegionService } from "../services/region-service";
import type { PlaceService, PlaceType } from "../services/place-service";
import type { SettingsService } from "../services/settings-service";
import { MapView, type MapViewHandle } from "../components/MapView";
import { AreaDetailContextMenu } from "../components/AreaDetailContextMenu";
import { DeletePlaceConfirmDialog } from "../components/DeletePlaceConfirmDialog";
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
import type { MovePlaceCommitArgs } from "../lib/move-place-flow";
import { movePlaceFlowReducer, selectMoveCommit } from "../lib/move-place-flow";
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
  /** 場所削除 commit の副作用フック。指定時はこちらが優先される。 */
  onCommitDeletePlace?: (placeId: string) => Promise<void> | void;
  /** 場所移動 commit の副作用フック。指定時はこちらが優先される。 */
  onCommitMovePlace?: (args: MovePlaceCommitArgs) => Promise<void> | void;
  /**
   * 場所移動開始の通知 (テスト用)。指定時は MapView の startPlaceMove は呼ばれず
   * このコールバックのみが発火する。
   */
  onMovePlaceStart?: (placeId: string) => void;
}

type ContextMenuState =
  | null
  | { variant: "blank"; x: number; y: number; lat: number; lng: number }
  | { variant: "place"; x: number; y: number; placeId: string };

const initialFlow: AddPlaceFlowState = { kind: "idle" };

export function AreaDetailEditPage({
  regionService,
  editor,
  polygonToArea,
  placeService,
  settingsService,
  linkedPolygonIds,
  onCommitAddPlace,
  onCommitDeletePlace,
  onCommitMovePlace,
  onMovePlaceStart,
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
  const [moveFlow, dispatchMove] = useReducer(movePlaceFlowReducer, {
    kind: "idle",
  } as const);
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);

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
      // 場所マーカー右クリックを page 側 state へ橋渡し
      handle.setPlaceContextMenuHandler((placeId, _type, x, y) => {
        setContextMenu({ variant: "place", placeId, x, y });
      });
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
      // Go 側 (time.Time) は空文字を JSON パースできないため ISO 文字列を渡す
      if (!placeService) return;
      const nowIso = new Date().toISOString();
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
        createdAt: nowIso,
        updatedAt: nowIso,
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

  const moveCommit = useCallback(
    async (args: MovePlaceCommitArgs) => {
      if (onCommitMovePlace) {
        await onCommitMovePlace(args);
        return;
      }
      if (!placeService) return;
      const cur = await placeService.getPlace(args.placeId).catch(() => null);
      if (!cur) return;
      await placeService.savePlace({
        ...cur,
        coord: { lat: args.lat, lng: args.lng },
        restoredFromId: args.restoredFromId ?? cur.restoredFromId ?? null,
      });
    },
    [onCommitMovePlace, placeService],
  );

  const handleMoveConfirmAt = useCallback(
    async (lat: number, lng: number) => {
      // moveFlow が tracking 状態であることを期待
      const placeId = moveFlow.kind === "tracking" ? moveFlow.placeId : null;
      if (!placeId) return;
      // 5m チェック用に削除済みを取得 (自身は move-flow 内で除外)
      const nearby = placeService
        ? await placeService
            .listDeletedPlacesNear(lat, lng, ADD_PLACE_RESTORE_RADIUS_M)
            .catch(() => [])
        : [];
      // tracking の現在位置を確定値で更新してから confirm
      dispatchMove({ type: "updatePosition", lat, lng });
      dispatchMove({
        type: "confirm",
        nearbyDeleted: nearby.map((p) => ({
          id: p.id,
          lat: p.coord.lat,
          lng: p.coord.lng,
          deletedAt: p.deletedAt ?? null,
        })),
      });
    },
    [moveFlow, placeService],
  );

  const handleMoveCancel = useCallback(() => {
    dispatchMove({ type: "cancel" });
  }, []);

  const handleMovePlace = useCallback(() => {
    if (!contextMenu || contextMenu.variant !== "place") return;
    const { placeId } = contextMenu;
    setContextMenu(null);
    dispatchMove({ type: "start", placeId, lat: 0, lng: 0 });
    if (onMovePlaceStart) {
      onMovePlaceStart(placeId);
      return;
    }
    mapRef.current?.startPlaceMove(
      placeId,
      (lat, lng) => {
        // 確定: handleMoveConfirmAt 経由で flow を進める
        void handleMoveConfirmAt(lat, lng);
      },
      () => {
        handleMoveCancel();
      },
    );
  }, [contextMenu, onMovePlaceStart, handleMoveConfirmAt, handleMoveCancel]);

  // committed → savePlace → reset
  useEffect(() => {
    if (moveFlow.kind !== "committed") return;
    const args = selectMoveCommit(moveFlow);
    if (!args) return;
    let cancelled = false;
    (async () => {
      await moveCommit(args);
      if (!cancelled) dispatchMove({ type: "reset" });
    })();
    return () => {
      cancelled = true;
    };
  }, [moveFlow, moveCommit]);

  const handleMoveRestoreYes = useCallback(() => {
    if (moveFlow.kind !== "confirmingRestore") return;
    dispatchMove({ type: "restoreYes" });
  }, [moveFlow]);

  const handleMoveRestoreNo = useCallback(() => {
    if (moveFlow.kind !== "confirmingRestore") return;
    dispatchMove({ type: "restoreNo" });
  }, [moveFlow]);

  const handleDeletePlace = useCallback(() => {
    if (!contextMenu || contextMenu.variant !== "place") return;
    setDeleteTargetId(contextMenu.placeId);
    setContextMenu(null);
  }, [contextMenu]);

  const handleDeleteConfirm = useCallback(async () => {
    const id = deleteTargetId;
    if (!id) return;
    setDeleteTargetId(null);
    if (onCommitDeletePlace) {
      await onCommitDeletePlace(id);
      return;
    }
    if (placeService) {
      await placeService.deletePlace(id);
    }
  }, [deleteTargetId, onCommitDeletePlace, placeService]);

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
            onMovePlace={handleMovePlace}
            onDeletePlace={handleDeletePlace}
            onClose={() => setContextMenu(null)}
          />
        )}
      </div>
      {deleteTargetId && (
        <DeletePlaceConfirmDialog
          onConfirm={handleDeleteConfirm}
          onCancel={() => setDeleteTargetId(null)}
        />
      )}
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
      {moveFlow.kind === "confirmingRestore" && (
        <div
          role="dialog"
          aria-label={t.areaDetail.linkRestoredPrompt}
          className="area-detail-restore-dialog"
        >
          <p>{t.areaDetail.linkRestoredPrompt}</p>
          <button onClick={handleMoveRestoreYes}>{t.areaDetail.yes}</button>
          <button onClick={handleMoveRestoreNo}>{t.areaDetail.no}</button>
        </div>
      )}
    </div>
  );
}
