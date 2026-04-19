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
import type { Place, PlaceService, PlaceType } from "../services/place-service";
import type { SettingsService } from "../services/settings-service";
import { MapView, type MapViewHandle } from "../components/MapView";
import { AreaDetailContextMenu } from "../components/AreaDetailContextMenu";
import { DeletePlaceConfirmDialog } from "../components/DeletePlaceConfirmDialog";
import { AddPlaceInputDialog } from "../components/AddPlaceInputDialog";
import { PlaceListPanel } from "../components/PlaceListPanel";
import {
  assignInitialSortOrder,
  needsInitialAssignment,
  reorderPlaces,
} from "../lib/place-sort-order";
import * as RegionBinding from "../../wailsjs/go/binding/RegionBinding";
import { formatAreaLabel, pointInRing } from "../lib/area-detail-geo";
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
import type { NetworkPolygonEditor, PolygonID } from "map-polygon-editor";

export interface AreaDetailEditPageProps {
  /** テスト用に注入可能。未指定なら本番 RegionBinding を使う。 */
  regionService?: RegionService;
  /** 未指定ならプレースホルダ div のみ描画 (テスト経路)。 */
  editor?: NetworkPolygonEditor | PolygonGeoSource;
  /** polygonId → areaId の紐付け表。editor 指定時に必須。 */
  polygonToArea?: ReadonlyMap<string, string>;
  /** 対象区域の場所取得。未指定なら場所は描画しない。 */
  placeService?: PlaceService;
  /** ui.areaDetailRadiusKm の取得。未指定なら既定 2.5km。 */
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
  const [pendingAddArgs, setPendingAddArgs] =
    useState<AddPlaceCommitArgs | null>(null);
  const [editingPlace, setEditingPlace] = useState<Place | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const targetRingRef = useRef<[number, number][] | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const bumpRefresh = useCallback(() => setRefreshKey((k) => k + 1), []);
  const [places, setPlaces] = useState<Place[]>([]);
  const [panelOpen, setPanelOpenState] = useState<boolean>(() => {
    try {
      const v = localStorage.getItem("ui.areaDetailPlaceListOpen");
      return v === null ? true : v === "true";
    } catch {
      return true;
    }
  });
  const [selectedPlaceId, setSelectedPlaceId] = useState<string | null>(null);
  const initialSortAssignedRef = useRef(false);
  const viewportInitializedRef = useRef(false);
  const setPanelOpen = useCallback((next: boolean) => {
    setPanelOpenState(next);
    try {
      localStorage.setItem("ui.areaDetailPlaceListOpen", String(next));
    } catch {
      // ignore
    }
  }, []);
  // パネル開閉後に Leaflet のレイアウトを再計算
  useEffect(() => {
    const id = requestAnimationFrame(() => mapRef.current?.invalidateSize());
    return () => cancelAnimationFrame(id);
  }, [panelOpen]);

  const isInsideTarget = useCallback((lat: number, lng: number): boolean => {
    const ring = targetRingRef.current;
    if (!ring) return true; // ring 未取得時は制限しない (初期化前のガード)
    return pointInRing({ lat, lng }, ring);
  }, []);

  const showOutsideError = useCallback(() => {
    setErrorMessage(t.areaDetail.outsideAreaError);
  }, [t]);

  // エラーメッセージは 4 秒で自動消去 (クリックでも消える)
  useEffect(() => {
    if (!errorMessage) return;
    const timer = setTimeout(() => setErrorMessage(null), 4000);
    return () => clearTimeout(timer);
  }, [errorMessage]);

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
        (await settingsService?.getAreaDetailRadiusKm().catch(() => 2.5)) ??
        2.5;
      let places = placeService
        ? await placeService.listPlaces(areaId).catch(() => [])
        : [];
      if (cancelled) return;

      // 初回のみ: 全件 sortOrder=0 なら CreatedAt 昇順で採番して永続化
      if (
        placeService &&
        !initialSortAssignedRef.current &&
        needsInitialAssignment(places)
      ) {
        const assigned = assignInitialSortOrder(places);
        try {
          for (const p of assigned) {
            await placeService.savePlace(p);
          }
          places = assigned;
          initialSortAssignedRef.current = true;
        } catch (err) {
          console.error(
            "[AreaDetailEditPage] initial sortOrder save failed:",
            err,
          );
        }
      }
      setPlaces(places);
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
      // target polygon の外周リング ([lng, lat] の配列) を内外判定用に保持
      const targetGeo =
        "getPolygonGeoJSON" in editor
          ? editor.getPolygonGeoJSON(vm.targetPolygonId as PolygonID)
          : null;
      targetRingRef.current =
        targetGeo && targetGeo.coordinates[0]
          ? (targetGeo.coordinates[0] as [number, number][])
          : null;
      const linked = linkedPolygonIds ?? new Set<string>();
      const sortedForMap = [...places].sort(
        (a, b) => a.sortOrder - b.sortOrder,
      );
      const indexById = new Map<string, number>();
      sortedForMap.forEach((p, idx) => indexById.set(p.id, idx));
      // 初回のみ対象区域にフォーカス。選択変更や place 追加・移動などの
      // 再描画で flyToBounds が走ると panTo と競合して大きく位置がずれるため、
      // 2 回目以降は skipFocus=true にする。
      const skipFocus = viewportInitializedRef.current;
      applyDetailViewModelToMap(
        handle,
        vm,
        places.map((p) => {
          const parts = [p.label.trim(), p.address.trim()].filter(Boolean);
          return {
            id: p.id,
            lat: p.coord.lat,
            lng: p.coord.lng,
            type: p.type as PlaceType,
            tooltip: parts.length > 0 ? parts.join(" / ") : t.areaDetail.noName,
            index: indexById.get(p.id),
            selected: p.id === selectedPlaceId,
          };
        }),
        linked,
        skipFocus,
      );
      viewportInitializedRef.current = true;
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
    refreshKey,
    selectedPlaceId,
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
        label: args.label ?? "",
        displayName: "",
        address: args.address ?? "",
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
    if (!isInsideTarget(lat, lng)) {
      showOutsideError();
      return;
    }
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
  }, [contextMenu, placeService, isInsideTarget, showOutsideError]);

  // ready 状態に来たら入力ダイアログを開く (commit は入力確定後)
  useEffect(() => {
    if (flow.kind !== "ready") return;
    const args = selectCommit(flow);
    if (!args) return;
    setPendingAddArgs(args);
    dispatchFlow({ type: "cancel" });
  }, [flow]);

  const handleRestoreYes = useCallback(() => {
    if (flow.kind !== "confirmingRestore") return;
    const args = selectCommit(flow, "yes");
    if (args) setPendingAddArgs(args);
    dispatchFlow({ type: "cancel" });
  }, [flow]);

  const handleRestoreNo = useCallback(() => {
    if (flow.kind !== "confirmingRestore") return;
    const args = selectCommit(flow, "no");
    if (args) setPendingAddArgs(args);
    dispatchFlow({ type: "cancel" });
  }, [flow]);

  const handleAddPlaceSave = useCallback(
    async (values: { address: string; label: string }) => {
      if (!pendingAddArgs) return;
      const args: AddPlaceCommitArgs = {
        ...pendingAddArgs,
        address: values.address,
        label: values.label,
      };
      setPendingAddArgs(null); // ダイアログを先に閉じて二重保存を防止
      try {
        await commit(args);
      } catch (err) {
        console.error("[AreaDetailEditPage] savePlace failed:", err);
      }
      bumpRefresh();
    },
    [pendingAddArgs, commit, bumpRefresh],
  );

  const handleAddPlaceCancel = useCallback(() => {
    setPendingAddArgs(null);
  }, []);

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
      if (!isInsideTarget(lat, lng)) {
        showOutsideError();
        dispatchMove({ type: "cancel" });
        bumpRefresh(); // マーカー位置を元に戻すために再描画
        return;
      }
      // 5m チェック用に削除済みを取得 (自身は move-flow 内で除外)
      const nearby = placeService
        ? await placeService
            .listDeletedPlacesNear(lat, lng, ADD_PLACE_RESTORE_RADIUS_M)
            .catch(() => [])
        : [];
      // reducer 側で state.kind === "tracking" をチェックするため
      // ここでの guard は不要 (stale closure 回避)
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
    [placeService, isInsideTarget, showOutsideError, bumpRefresh],
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
      if (cancelled) return;
      dispatchMove({ type: "reset" });
      bumpRefresh();
    })();
    return () => {
      cancelled = true;
    };
  }, [moveFlow, moveCommit, bumpRefresh]);

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

  const handleEditPlace = useCallback(async () => {
    if (!contextMenu || contextMenu.variant !== "place") return;
    const { placeId } = contextMenu;
    setContextMenu(null);
    if (!placeService) return;
    const place = await placeService.getPlace(placeId).catch(() => null);
    if (!place) return;
    setEditingPlace(place);
  }, [contextMenu, placeService]);

  const handleEditPlaceSave = useCallback(
    async (values: { address: string; label: string }) => {
      if (!editingPlace) return;
      const updated: Place = {
        ...editingPlace,
        label: values.label,
        address: values.address,
      };
      setEditingPlace(null);
      try {
        if (placeService) await placeService.savePlace(updated);
      } catch (err) {
        console.error("[AreaDetailEditPage] editPlace failed:", err);
      }
      bumpRefresh();
    },
    [editingPlace, placeService, bumpRefresh],
  );

  const handleEditPlaceCancel = useCallback(() => {
    setEditingPlace(null);
  }, []);

  const handleDeleteConfirm = useCallback(async () => {
    const id = deleteTargetId;
    if (!id) return;
    setDeleteTargetId(null);
    if (onCommitDeletePlace) {
      await onCommitDeletePlace(id);
    } else if (placeService) {
      await placeService.deletePlace(id);
    }
    bumpRefresh();
  }, [deleteTargetId, onCommitDeletePlace, placeService, bumpRefresh]);

  const handlePlaceRowClick = useCallback(
    (placeId: string) => {
      const p = places.find((x) => x.id === placeId);
      if (!p) return;
      setSelectedPlaceId(placeId);
      mapRef.current?.focusPlace(p.coord.lat, p.coord.lng);
    },
    [places],
  );

  const handleReorder = useCallback(
    async (fromIndex: number, toIndex: number) => {
      const sorted = [...places].sort((a, b) => a.sortOrder - b.sortOrder);
      const next = reorderPlaces(sorted, fromIndex, toIndex);
      setPlaces(next);
      if (!placeService) return;
      try {
        for (const p of next) {
          await placeService.savePlace(p);
        }
      } catch (err) {
        console.error("[AreaDetailEditPage] reorder save failed:", err);
      }
      bumpRefresh();
    },
    [places, placeService, bumpRefresh],
  );

  const mapEnabled = Boolean(editor && polygonToArea);

  return (
    <div className="area-detail-edit-page">
      <div className="area-detail-body">
        <div
          ref={containerRef}
          className="area-detail-map"
          data-testid="area-detail-map"
        >
          <button
            type="button"
            className="area-detail-topbar"
            onClick={() => navigate(-1)}
            aria-label={t.areaDetail.back}
          >
            <span className="area-detail-back-icon" aria-hidden="true">
              ←
            </span>
            <span className="area-detail-label">
              {label ?? t.areaDetail.title}
            </span>
          </button>
          {mapEnabled && (
            <MapView ref={mapRef} onContextMenu={handleMapContextMenu} />
          )}
          {contextMenu && (
            <AreaDetailContextMenu
              x={contextMenu.x}
              y={contextMenu.y}
              variant={contextMenu.variant}
              onAddHouse={handleAddHouse}
              onEditPlace={handleEditPlace}
              onMovePlace={handleMovePlace}
              onDeletePlace={handleDeletePlace}
              onClose={() => setContextMenu(null)}
            />
          )}
          {errorMessage && (
            <div
              role="alert"
              className="area-detail-error-banner"
              onClick={() => setErrorMessage(null)}
            >
              {errorMessage}
            </div>
          )}
        </div>
        <PlaceListPanel
          places={places}
          open={panelOpen}
          onToggleOpen={setPanelOpen}
          onPlaceClick={handlePlaceRowClick}
          onReorder={handleReorder}
          selectedPlaceId={selectedPlaceId}
        />
      </div>
      {deleteTargetId && (
        <DeletePlaceConfirmDialog
          onConfirm={handleDeleteConfirm}
          onCancel={() => setDeleteTargetId(null)}
        />
      )}
      {pendingAddArgs && (
        <AddPlaceInputDialog
          onSave={handleAddPlaceSave}
          onCancel={handleAddPlaceCancel}
        />
      )}
      {editingPlace && (
        <AddPlaceInputDialog
          onSave={handleEditPlaceSave}
          onCancel={handleEditPlaceCancel}
          initialLabel={editingPlace.label}
          initialAddress={editingPlace.address}
          title={t.areaDetail.editPlaceDialogTitle}
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
