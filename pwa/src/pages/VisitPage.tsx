import {
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from "react";
import type { NetworkPolygonEditor, PolygonID } from "map-polygon-editor";
import { useI18n } from "../contexts/I18nContext";
import { useSharedApplied } from "../hooks/useSharedApplied";
import { PLACE_TABLES, VISIT_TABLES } from "../lib/linkself/shared-events";
import { MapView, type MapViewHandle } from "../components/MapView";
import { BuildingVisitDialog } from "../components/BuildingVisitDialog";
import { AreaDetailContextMenu } from "../components/AreaDetailContextMenu";
import { AddPlaceInputDialog } from "../components/AddPlaceInputDialog";
import { DeletePlaceConfirmDialog } from "../components/DeletePlaceConfirmDialog";
import { PlaceListPanel } from "../components/PlaceListPanel";
import {
  BuildingEditDialog,
  type BuildingDialogSaveArgs,
} from "../components/BuildingEditDialog";
import {
  VisitRecordDialog,
  type PlaceEditRequestKind,
  type VisitRecordSaveArgs,
} from "../components/VisitRecordDialog";
import type { Place } from "../services/place-service";
import type {
  VisitRecord,
  VisitService as VisitServiceClass,
} from "../services/visit-service";
import { nextSortOrder, reorderPlaces } from "../lib/place-sort-order";
import { applyRoomRowsSave, type RoomRow } from "../lib/building-flow";
import type { PolygonGeoSource } from "../lib/area-detail-controller";
import {
  addPlaceFlowReducer,
  selectCommit,
  ADD_PLACE_RESTORE_RADIUS_M,
  type AddPlaceCommitArgs,
  type AddPlaceFlowState,
} from "../lib/add-place-flow";
import {
  movePlaceFlowReducer,
  selectMoveCommit,
  type MovePlaceCommitArgs,
} from "../lib/move-place-flow";
import {
  useAreaDetailMap,
  type UseAreaDetailMapPlaceService,
  type UseAreaDetailMapSettingsService,
} from "../hooks/useAreaDetailMap";
import { useNarrowViewport } from "../hooks/useMediaQuery";

/**
 * 直接作成に savePlace が必須（場所の直接追加。docs/wants/08）。
 * getPlace / listDeletedPlacesNear は直接編集（編集メンバー以上×
 * 非タッチ端末）でのみ使用するため任意（docs/wants/07「場所操作の権限」）。
 * deletePlace は直接編集に加え、部屋の削除（全メンバー・全端末）でも使用する。
 * listDeletedRooms は部屋の同番号復元用（docs/wants/03。未提供なら復元なしで
 * 常に新規作成にフォールバック）。
 */
export type VisitPagePlaceServiceLike = UseAreaDetailMapPlaceService & {
  savePlace: (place: Place) => Promise<Place>;
  getPlace?: (id: string) => Promise<Place | null>;
  deletePlace?: (id: string) => Promise<void>;
  listDeletedPlacesNear?: (
    lat: number,
    lng: number,
    radiusM: number,
  ) => Promise<Place[]>;
  listDeletedRooms?: (buildingId: string) => Promise<Place[]>;
};

export type VisitPageVisitServiceLike = Pick<
  VisitServiceClass,
  | "recordVisit"
  | "recordVisitPhase1"
  | "listMyVisitHistory"
  | "getLastMetDate"
  | "deleteVisitRecord"
  | "listVisitRecords"
>;

export interface VisitPageProps {
  /** 対象区域 ID（ルート /visits/:areaId 由来） */
  areaId: string;
  /** ヘッダー表示用「{区域ID} {区域親番名}」。未解決時は areaId を表示する。 */
  areaLabel?: string;
  /** 訪問記録の actor（自分の DID） */
  actorId: string;
  placeService: VisitPagePlaceServiceLike;
  visitService: VisitPageVisitServiceLike;
  /** ポリゴンエディタ。テスト用に PolygonGeoSource でも可。 */
  editor?: NetworkPolygonEditor | PolygonGeoSource;
  /** polygonId → areaId の紐付け表 */
  polygonToArea?: ReadonlyMap<string, string>;
  /** 区域に紐づく polygonId 集合 */
  linkedPolygonIds?: Set<string>;
  /** 半径取得 (任意) */
  settingsService?: UseAreaDetailMapSettingsService;
  /**
   * 編集リクエスト（要削除/要移動/その他）の処理は本ページ外（申請サービス）に委譲する。
   * 仕様 docs/wants/07_通知と申請.md「場所操作の権限」
   */
  onPlaceEditRequest: (
    placeId: string,
    kind: PlaceEditRequestKind,
    text: string,
  ) => void;
  /**
   * 場所の直接編集権限（編集メンバー以上 × 非タッチ端末）。
   * true のとき右クリックの場所編集/移動/削除・一覧の並替/編集を提供する。
   * 仕様 docs/wants/07_通知と申請.md「場所操作の権限」
   */
  canDirectEdit?: boolean;
  /**
   * 区域編集画面から遷移してきた場合のみ指定される「区域編集に戻る」。
   * 指定時は地図上に戻るボタンを表示する（docs/wants/03「場所の直接編集」）。
   */
  onBackToMap?: () => void;
  /**
   * 初期選択する場所 ID（申請一覧からの遷移 `?place=` 用。
   * docs/wants/07「申請一覧 / 申請対象への遷移」）。
   * マーカー強調と場所一覧の行ハイライトに反映される。
   */
  initialSelectedPlaceId?: string;
}

type DialogState =
  | { kind: "house"; place: Place; parent?: Place }
  | { kind: "building"; place: Place }
  | null;

/** 右クリック/ロングタップのコンテキストメニュー */
type ContextMenuState =
  | null
  | { variant: "blank"; x: number; y: number; lat: number; lng: number }
  | { variant: "place"; x: number; y: number; placeId: string };

const initialAddFlow: AddPlaceFlowState = { kind: "idle" };

export function VisitPage({
  areaId,
  areaLabel,
  actorId,
  placeService,
  visitService,
  editor,
  polygonToArea,
  linkedPolygonIds,
  settingsService,
  onPlaceEditRequest,
  canDirectEdit = false,
  onBackToMap,
  initialSelectedPlaceId,
}: VisitPageProps) {
  const { t } = useI18n();
  const mapRef = useRef<MapViewHandle | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [dialog, setDialog] = useState<DialogState>(null);
  const [contextMenu, setContextMenu] = useState<ContextMenuState>(null);
  const [lastMetDate, setLastMetDate] = useState<Date | null>(null);
  const [myHistory, setMyHistory] = useState<VisitRecord[]>([]);
  const [refreshKey, setRefreshKey] = useState(0);
  const bumpRefresh = useCallback(() => setRefreshKey((k) => k + 1), []);
  // ScopeNetwork 受信追従: 他メンバー・他端末の場所追加/訪問記録が開いている
  // 訪問記録画面（マーカー・一覧・直近記録併記）に反映される。
  useSharedApplied([...PLACE_TABLES, ...VISIT_TABLES], bumpRefresh);
  const [selectedPlaceId, setSelectedPlaceId] = useState<string | null>(
    initialSelectedPlaceId ?? null,
  );
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // --- 直接編集（canDirectEdit のときのみ使用） ---
  const [addFlow, dispatchAddFlow] = useReducer(
    addPlaceFlowReducer,
    initialAddFlow,
  );
  const [moveFlow, dispatchMove] = useReducer(movePlaceFlowReducer, {
    kind: "idle",
  } as const);
  const [pendingAddArgs, setPendingAddArgs] =
    useState<AddPlaceCommitArgs | null>(null);
  const [editingPlace, setEditingPlace] = useState<Place | null>(null);
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);
  const [pendingBuildingDelete, setPendingBuildingDelete] =
    useState<Place | null>(null);
  const [buildingDialog, setBuildingDialog] = useState<
    | { mode: "create"; lat: number; lng: number }
    | { mode: "edit"; building: Place }
    | null
  >(null);

  // --- 場所一覧（広幅=右ペイン / 狭幅=オーバーレイ） ---
  const narrow = useNarrowViewport();
  const [paneOpen, setPaneOpenState] = useState<boolean>(() => {
    try {
      const v = localStorage.getItem("ui.areaDetailPlaceListOpen");
      return v === null ? true : v === "true";
    } catch {
      return true;
    }
  });
  const setPaneOpen = useCallback((next: boolean) => {
    setPaneOpenState(next);
    try {
      localStorage.setItem("ui.areaDetailPlaceListOpen", String(next));
    } catch {
      // ignore
    }
  }, []);
  const [overlayOpen, setOverlayOpen] = useState(false);

  const { places, rooms, setPlaces, isInsideTarget } = useAreaDetailMap({
    mapRef,
    containerRef,
    editor,
    polygonToArea,
    areaId,
    placeService,
    settingsService,
    linkedPolygonIds,
    selectedPlaceId,
    refreshKey,
    noNameLabel: t.areaDetail.noName,
    enableInitialSortAssignment: true,
  });

  // 区域内の訪問記録（共有分）を場所ごとにまとめる（一覧の記録併記用）
  const [recordsByPlace, setRecordsByPlace] = useState<
    Map<string, VisitRecord[]>
  >(new Map());
  useEffect(() => {
    let cancelled = false;
    visitService
      .listVisitRecords(areaId)
      .then((records) => {
        if (cancelled) return;
        const m = new Map<string, VisitRecord[]>();
        for (const r of records) {
          if (!r.placeId) continue;
          const list = m.get(r.placeId);
          if (list) list.push(r);
          else m.set(r.placeId, [r]);
        }
        for (const list of m.values()) {
          list.sort((a, b) => b.visitedAt.localeCompare(a.visitedAt));
        }
        setRecordsByPlace(m);
      })
      .catch((err) => {
        console.error("[VisitPage] listVisitRecords failed:", err);
      });
    return () => {
      cancelled = true;
    };
  }, [visitService, areaId, refreshKey]);

  // 地図コンテナのサイズ変化に追従して invalidateSize を呼ぶ
  useEffect(() => {
    const el = containerRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => {
      mapRef.current?.invalidateSize();
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // エラーメッセージは 4 秒で自動消去 (クリックでも消える)
  useEffect(() => {
    if (!errorMessage) return;
    const timer = setTimeout(() => setErrorMessage(null), 4000);
    return () => clearTimeout(timer);
  }, [errorMessage]);

  const showOutsideError = useCallback(() => {
    setErrorMessage(t.areaDetail.outsideAreaError);
  }, [t]);

  const openHouseDialog = useCallback(
    async (place: Place) => {
      const [last, history] = await Promise.all([
        visitService.getLastMetDate(place.id),
        visitService.listMyVisitHistory(place.id, actorId),
      ]);
      setLastMetDate(last);
      setMyHistory(history);
      setDialog({ kind: "house", place });
    },
    [visitService, actorId],
  );

  const openBuildingDialog = useCallback((place: Place) => {
    setDialog({ kind: "building", place });
  }, []);

  // クリック時に最新の places / dialog opener を参照するための ref。
  // setPlaceClickHandler のクロージャが古い places で固定化されないようにする。
  const placesRef = useRef<Place[]>([]);
  useEffect(() => {
    placesRef.current = places;
  }, [places]);
  const openHouseRef = useRef(openHouseDialog);
  openHouseRef.current = openHouseDialog;
  const openBuildingRef = useRef(openBuildingDialog);
  openBuildingRef.current = openBuildingDialog;

  // 場所マーカー左クリックを訪問ダイアログ起動に変換する
  useEffect(() => {
    if (!editor || !polygonToArea) return;
    const handle = mapRef.current;
    if (!handle) return;
    handle.setPlaceClickHandler((placeId) => {
      const p = placesRef.current.find((x) => x.id === placeId);
      if (!p) return;
      if (p.type === "house") {
        openHouseRef.current(p);
      } else if (p.type === "building") {
        openBuildingRef.current(p);
      }
    });
    return () => {
      handle.setPlaceClickHandler(null);
    };
  }, [editor, polygonToArea]);

  // 場所マーカー右クリック → 直接編集メニュー（直接編集権限があるときのみ）
  useEffect(() => {
    if (!canDirectEdit || !editor || !polygonToArea) return;
    const handle = mapRef.current;
    if (!handle) return;
    handle.setPlaceContextMenuHandler((placeId, _type, x, y) => {
      setContextMenu({ variant: "place", placeId, x, y });
    });
    return () => {
      handle.setPlaceContextMenuHandler(null);
    };
  }, [canDirectEdit, editor, polygonToArea]);

  // 対象区域のポリゴンID群（飛地含む。地図を区域へ戻すボタンで使用）
  const targetPolygonIds = useMemo(() => {
    if (!polygonToArea) return [];
    const ids: string[] = [];
    for (const [polygonId, mappedAreaId] of polygonToArea) {
      if (mappedAreaId === areaId) ids.push(polygonId);
    }
    return ids;
  }, [polygonToArea, areaId]);

  // 地図を無関係な場所までパン/ズームしても、ワンタップで対象区域（飛地含む
  // 全ポリゴン）が収まるビューへ戻せる（docs/wants/08「地図 UI」）
  const handleRecenterToArea = useCallback(() => {
    if (targetPolygonIds.length === 0) return;
    mapRef.current?.focusPolygons(targetPolygonIds as PolygonID[]);
  }, [targetPolygonIds]);

  const handleSaveVisit = useCallback(
    async (place: Place, args: VisitRecordSaveArgs) => {
      // Phase 1: Activity 未配線のため Phase 1 専用 API を使用。
      // チェックアウト/Activity 配線時に recordVisit へ移行する。
      await visitService.recordVisitPhase1(
        actorId,
        areaId,
        place.id,
        args.result,
        args.visitedAt,
        args.applicationText,
      );
      setDialog(null);
      bumpRefresh();
    },
    [visitService, actorId, areaId, bumpRefresh],
  );

  const closeDialog = useCallback(() => setDialog(null), []);

  // 集合住宅ダイアログから部屋を選択 → 部屋訪問ダイアログに切替。
  // 部屋訪問ダイアログ上部の表示は親集合住宅名 + 部屋番号となるため、
  // dialog state に親 building を持たせる (仕様 docs/wants/08 「部屋訪問ダイアログ」)。
  const openRoomDialog = useCallback(
    async (room: Place) => {
      const [last, history] = await Promise.all([
        visitService.getLastMetDate(room.id),
        visitService.listMyVisitHistory(room.id, actorId),
      ]);
      setLastMetDate(last);
      setMyHistory(history);
      const parent = places.find((p) => p.id === room.parentId);
      setDialog({ kind: "house", place: room, parent });
    },
    [visitService, actorId, places],
  );

  // --- 部屋の直接編集（部屋編集モードの「確定」で一括保存。全メンバー・全端末） ---
  // 仕様 docs/wants/08「集合住宅訪問ダイアログ／部屋の追加・編集・削除」。
  // 差分適用と同番号削除済み Room の復元は applyRoomRowsSave に共通化
  // （docs/wants/03「部屋（Room）の同番号復元」）。

  const handleSaveRooms = useCallback(
    async (
      buildingId: string,
      rows: readonly RoomRow[],
      baseExistingIds: readonly string[],
    ) => {
      try {
        const existingRooms = rooms.filter(
          (r) => r.parentId === buildingId && !r.deletedAt,
        );
        await applyRoomRowsSave(placeService, {
          existingRooms,
          baseExistingIds,
          rows,
          buildingId,
          areaId,
        });
      } catch (err) {
        console.error("[VisitPage] save rooms failed:", err);
      }
      bumpRefresh();
    },
    [placeService, rooms, areaId, bumpRefresh],
  );

  const handleMapContextMenu = useCallback(
    (lat: number, lng: number, x: number, y: number) => {
      // 空白部分の長押し/右クリック → 「家/集合住宅を追加」選択メニューを開く。
      // 場所アイコン上の contextmenu は MapRenderer 側で stopPropagation
      // されているため、ここには到達しない。
      // 仕様 docs/wants/08「場所の直接追加」
      setContextMenu({ variant: "blank", lat, lng, x, y });
    },
    [],
  );

  const buildNewHouse = useCallback(
    (args: AddPlaceCommitArgs, values: { address: string; label: string }) => {
      const nowIso = new Date().toISOString();
      const place: Place = {
        id: "",
        areaId,
        coord: { lat: args.lat, lng: args.lng },
        type: "house",
        label: values.label,
        displayName: "",
        address: values.address,
        description: "",
        parentId: "",
        sortOrder: nextSortOrder(places),
        languages: [],
        doNotVisit: false,
        doNotVisitNote: "",
        createdAt: nowIso,
        updatedAt: nowIso,
        deletedAt: null,
        restoredFromId: args.restoredFromId ?? null,
      };
      return place;
    },
    [areaId, places],
  );

  // 「家を追加」:
  // - 直接編集権限あり: 区域内制約 + 5m 以内の削除済み場所の復元確認フロー
  //   （docs/wants/03「場所の直接編集」「場所の論理削除と訪問記録の紐付け」）
  // - 権限なし（直接追加パス）: 制約・復元確認なしで入力ダイアログへ
  //   （docs/wants/08「場所の直接追加」）
  const handleAddHouse = useCallback(async () => {
    if (!contextMenu || contextMenu.variant !== "blank") return;
    const { lat, lng } = contextMenu;
    setContextMenu(null);
    if (!canDirectEdit) {
      setPendingAddArgs({ lat, lng });
      return;
    }
    if (!isInsideTarget(lat, lng)) {
      showOutsideError();
      return;
    }
    const nearby = placeService.listDeletedPlacesNear
      ? await placeService
          .listDeletedPlacesNear(lat, lng, ADD_PLACE_RESTORE_RADIUS_M)
          .catch(() => [])
      : [];
    dispatchAddFlow({
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
  }, [
    contextMenu,
    canDirectEdit,
    placeService,
    isInsideTarget,
    showOutsideError,
  ]);

  // ready 状態に来たら入力ダイアログを開く (保存は入力確定後)
  useEffect(() => {
    if (addFlow.kind !== "ready") return;
    const args = selectCommit(addFlow);
    if (!args) return;
    setPendingAddArgs(args);
    dispatchAddFlow({ type: "cancel" });
  }, [addFlow]);

  const handleRestoreYes = useCallback(() => {
    if (addFlow.kind !== "confirmingRestore") return;
    const args = selectCommit(addFlow, "yes");
    if (args) setPendingAddArgs(args);
    dispatchAddFlow({ type: "cancel" });
  }, [addFlow]);

  const handleRestoreNo = useCallback(() => {
    if (addFlow.kind !== "confirmingRestore") return;
    const args = selectCommit(addFlow, "no");
    if (args) setPendingAddArgs(args);
    dispatchAddFlow({ type: "cancel" });
  }, [addFlow]);

  const handleAddPlaceSave = useCallback(
    async (values: { address: string; label: string }) => {
      if (!pendingAddArgs) return;
      const place = buildNewHouse(pendingAddArgs, values);
      setPendingAddArgs(null); // ダイアログを先に閉じて二重保存を防止
      try {
        await placeService.savePlace(place);
      } catch (err) {
        console.error("[VisitPage] add house failed:", err);
      }
      bumpRefresh();
    },
    [pendingAddArgs, buildNewHouse, placeService, bumpRefresh],
  );

  const handleAddBuilding = useCallback(() => {
    if (!contextMenu || contextMenu.variant !== "blank") return;
    const { lat, lng } = contextMenu;
    setContextMenu(null);
    if (canDirectEdit && !isInsideTarget(lat, lng)) {
      showOutsideError();
      return;
    }
    setBuildingDialog({ mode: "create", lat, lng });
  }, [contextMenu, canDirectEdit, isInsideTarget, showOutsideError]);

  // --- 直接編集: 場所編集 / 移動 / 削除（canDirectEdit のときのみ到達） ---

  const handleEditPlace = useCallback(async () => {
    if (!contextMenu || contextMenu.variant !== "place") return;
    const { placeId } = contextMenu;
    setContextMenu(null);
    if (!placeService.getPlace) return;
    const place = await placeService.getPlace(placeId).catch(() => null);
    if (!place) return;
    if (place.type === "building") {
      setBuildingDialog({ mode: "edit", building: place });
    } else {
      setEditingPlace(place);
    }
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
        await placeService.savePlace(updated);
      } catch (err) {
        console.error("[VisitPage] editPlace failed:", err);
      }
      bumpRefresh();
    },
    [editingPlace, placeService, bumpRefresh],
  );

  const moveCommit = useCallback(
    async (args: MovePlaceCommitArgs) => {
      if (!placeService.getPlace) return;
      const cur = await placeService.getPlace(args.placeId).catch(() => null);
      if (!cur) return;
      await placeService.savePlace({
        ...cur,
        coord: { lat: args.lat, lng: args.lng },
        restoredFromId: args.restoredFromId ?? cur.restoredFromId ?? null,
      });
    },
    [placeService],
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
      const nearby = placeService.listDeletedPlacesNear
        ? await placeService
            .listDeletedPlacesNear(lat, lng, ADD_PLACE_RESTORE_RADIUS_M)
            .catch(() => [])
        : [];
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
    mapRef.current?.startPlaceMove(
      placeId,
      (lat, lng) => {
        void handleMoveConfirmAt(lat, lng);
      },
      () => {
        handleMoveCancel();
      },
    );
  }, [contextMenu, handleMoveConfirmAt, handleMoveCancel]);

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

  const handleDeletePlaceGeneric = useCallback(() => {
    if (!contextMenu || contextMenu.variant !== "place") return;
    const { placeId } = contextMenu;
    setContextMenu(null);
    const p = places.find((x) => x.id === placeId);
    if (p && p.type === "building") {
      setPendingBuildingDelete(p);
      return;
    }
    setDeleteTargetId(placeId);
  }, [contextMenu, places]);

  const handleDeleteConfirm = useCallback(async () => {
    const id = deleteTargetId;
    if (!id) return;
    setDeleteTargetId(null);
    if (placeService.deletePlace) {
      await placeService.deletePlace(id);
    }
    bumpRefresh();
  }, [deleteTargetId, placeService, bumpRefresh]);

  const buildingRoomCount = useCallback(
    (buildingId: string): number =>
      rooms.filter((r) => r.parentId === buildingId && !r.deletedAt).length,
    [rooms],
  );

  const handleBuildingDeleteConfirm = useCallback(async () => {
    const target = pendingBuildingDelete;
    setPendingBuildingDelete(null);
    if (!target || !placeService.deletePlace) return;
    try {
      const childRooms = rooms.filter(
        (r) => r.parentId === target.id && !r.deletedAt,
      );
      for (const r of childRooms) {
        await placeService.deletePlace(r.id);
      }
      await placeService.deletePlace(target.id);
    } catch (err) {
      console.error("[VisitPage] deleteBuilding (cascade) failed:", err);
    }
    bumpRefresh();
  }, [pendingBuildingDelete, placeService, rooms, bumpRefresh]);

  // --- 集合住宅ダイアログ（作成は全ロール / 編集は直接編集権限のみ到達） ---

  const handleBuildingDialogSave = useCallback(
    async (args: BuildingDialogSaveArgs) => {
      const snapshot = buildingDialog;
      setBuildingDialog(null);
      if (!snapshot) return;
      const nowIso = new Date().toISOString();
      try {
        if (snapshot.mode === "create") {
          const building = await placeService.savePlace({
            id: "",
            areaId,
            coord: { lat: snapshot.lat, lng: snapshot.lng },
            type: "building",
            label: args.label,
            displayName: "",
            address: args.address,
            description: args.description,
            parentId: "",
            sortOrder: nextSortOrder(places),
            languages: [],
            doNotVisit: false,
            doNotVisitNote: "",
            createdAt: nowIso,
            updatedAt: nowIso,
            deletedAt: null,
            restoredFromId: null,
          });
          for (let i = 0; i < args.rows.length; i++) {
            const row = args.rows[i];
            await placeService.savePlace({
              id: "",
              areaId,
              coord: { lat: 0, lng: 0 },
              type: "room",
              label: "",
              displayName: row.displayName,
              address: "",
              description: "",
              parentId: building.id,
              sortOrder: i,
              languages: [],
              doNotVisit: false,
              doNotVisitNote: "",
              createdAt: nowIso,
              updatedAt: nowIso,
              deletedAt: null,
              restoredFromId: null,
            });
          }
        } else {
          const buildingId = snapshot.building.id;
          const updatedBuilding: Place = {
            ...snapshot.building,
            label: args.label,
            address: args.address,
            description: args.description,
          };
          await placeService.savePlace(updatedBuilding);
          const existing = rooms.filter(
            (r) => r.parentId === buildingId && !r.deletedAt,
          );
          await applyRoomRowsSave(placeService, {
            existingRooms: existing,
            baseExistingIds: args.baseRoomIds,
            rows: args.rows,
            buildingId,
            areaId,
          });
        }
      } catch (err) {
        console.error("[VisitPage] saveBuilding failed:", err);
      }
      bumpRefresh();
    },
    [buildingDialog, placeService, areaId, places, rooms, bumpRefresh],
  );

  // --- 場所一覧（右ペイン/オーバーレイ）の行操作 ---

  const handlePlaceRowClick = useCallback(
    (placeId: string) => {
      const p = places.find((x) => x.id === placeId);
      if (!p) return;
      setSelectedPlaceId(placeId);
      mapRef.current?.focusPlace(p.coord.lat, p.coord.lng);
    },
    [places],
  );

  const handlePlaceRowDoubleClick = useCallback(
    (placeId: string) => {
      if (!canDirectEdit) return;
      const p = places.find((x) => x.id === placeId);
      if (!p) return;
      if (p.type === "building") {
        setBuildingDialog({ mode: "edit", building: p });
      } else if (p.type === "house") {
        setEditingPlace(p);
      }
    },
    [canDirectEdit, places],
  );

  const handleReorder = useCallback(
    async (fromIndex: number, toIndex: number) => {
      if (!canDirectEdit) return;
      const sorted = [...places]
        .filter((p) => p.type !== "room")
        .sort((a, b) => a.sortOrder - b.sortOrder);
      const next = reorderPlaces(sorted, fromIndex, toIndex);
      setPlaces(next);
      try {
        for (const p of next) {
          await placeService.savePlace(p);
        }
      } catch (err) {
        console.error("[VisitPage] reorder save failed:", err);
      }
      bumpRefresh();
    },
    [canDirectEdit, places, setPlaces, placeService, bumpRefresh],
  );

  const roomCountsMap = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of places) {
      if (p.type === "building") m.set(p.id, buildingRoomCount(p.id));
    }
    return m;
  }, [places, buildingRoomCount]);

  const listPanel = (variant: "pane" | "overlay") => (
    <PlaceListPanel
      places={places}
      open={variant === "overlay" ? true : paneOpen}
      onToggleOpen={variant === "overlay" ? setOverlayOpen : setPaneOpen}
      onPlaceClick={handlePlaceRowClick}
      onPlaceDoubleClick={handlePlaceRowDoubleClick}
      onReorder={handleReorder}
      selectedPlaceId={selectedPlaceId}
      roomCounts={roomCountsMap}
      visitRecords={recordsByPlace}
      rooms={rooms}
      reorderEnabled={canDirectEdit}
      variant={variant}
    />
  );

  return (
    <div className="visit-page">
      <header className="visit-page-header">
        <h2>
          {t.visitRecord.areaLabel.replace("{area}", areaLabel ?? areaId)}
        </h2>
        {targetPolygonIds.length > 0 && (
          <button
            type="button"
            className="btn btn-sm btn-secondary visit-page-recenter-button"
            onClick={handleRecenterToArea}
          >
            {t.visitRecord.recenterToArea}
          </button>
        )}
      </header>

      <div className="visit-page-body">
        <div
          ref={containerRef}
          className={`visit-page-map${onBackToMap ? " with-back" : ""}${narrow ? " with-list" : ""}`}
          data-testid="visit-page-map"
        >
          {editor && polygonToArea && (
            <MapView ref={mapRef} onContextMenu={handleMapContextMenu} />
          )}
          {onBackToMap && (
            <button
              type="button"
              className="btn btn-sm visit-page-back-button"
              onClick={onBackToMap}
            >
              {t.visitRecord.backToMapEditor}
            </button>
          )}
          {narrow && (
            <button
              type="button"
              className="btn btn-sm visit-page-list-button"
              onClick={() => setOverlayOpen(true)}
            >
              {t.areaDetail.placeListShowButton}
            </button>
          )}
          {contextMenu && (
            <AreaDetailContextMenu
              x={contextMenu.x}
              y={contextMenu.y}
              variant={contextMenu.variant}
              onAddHouse={handleAddHouse}
              onAddBuilding={handleAddBuilding}
              onEditPlace={canDirectEdit ? handleEditPlace : undefined}
              onMovePlace={canDirectEdit ? handleMovePlace : undefined}
              onDeletePlace={
                canDirectEdit ? handleDeletePlaceGeneric : undefined
              }
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
        {!narrow && listPanel("pane")}
      </div>
      {narrow && overlayOpen && listPanel("overlay")}

      {dialog?.kind === "house" &&
        (() => {
          const isRoom = dialog.place.type === "room";
          const placeLabel =
            isRoom && dialog.parent
              ? `${dialog.parent.label || t.areaDetail.noName} ${dialog.place.displayName}`
              : dialog.place.label || t.areaDetail.noName;
          const placeAddress =
            isRoom && dialog.parent
              ? dialog.parent.address
              : dialog.place.address;
          return (
            <VisitRecordDialog
              placeLabel={placeLabel}
              placeAddress={placeAddress}
              placeId={dialog.place.id}
              lastMetDate={lastMetDate}
              myHistory={myHistory}
              onSave={(args) => handleSaveVisit(dialog.place, args)}
              onCancel={closeDialog}
              onPlaceEditRequest={(kind, text) =>
                onPlaceEditRequest(dialog.place.id, kind, text)
              }
            />
          );
        })()}

      {dialog?.kind === "building" && (
        <BuildingVisitDialog
          buildingLabel={dialog.place.label || t.areaDetail.noName}
          buildingAddress={dialog.place.address}
          buildingDescription={dialog.place.description}
          rooms={rooms
            .filter((r) => r.parentId === dialog.place.id)
            .sort((a, b) => a.sortOrder - b.sortOrder)}
          roomLastVisitMap={new Map()}
          onSelectRoom={openRoomDialog}
          onSaveRooms={(rows, baseExistingIds) =>
            handleSaveRooms(dialog.place.id, rows, baseExistingIds)
          }
          onPlaceEditRequest={(kind, text) =>
            onPlaceEditRequest(dialog.place.id, kind, text)
          }
          onCancel={closeDialog}
        />
      )}

      {pendingAddArgs && (
        <AddPlaceInputDialog
          onSave={handleAddPlaceSave}
          onCancel={() => setPendingAddArgs(null)}
        />
      )}

      {editingPlace && (
        <AddPlaceInputDialog
          onSave={handleEditPlaceSave}
          onCancel={() => setEditingPlace(null)}
          initialLabel={editingPlace.label}
          initialAddress={editingPlace.address}
          title={t.areaDetail.editPlaceDialogTitle}
        />
      )}

      {addFlow.kind === "confirmingRestore" && (
        <div className="dialog-backdrop">
          <div
            role="dialog"
            aria-label={t.areaDetail.linkRestoredPrompt}
            className="area-detail-restore-dialog"
          >
            <p>{t.areaDetail.linkRestoredPrompt}</p>
            <button onClick={handleRestoreYes}>{t.areaDetail.yes}</button>
            <button onClick={handleRestoreNo}>{t.areaDetail.no}</button>
          </div>
        </div>
      )}

      {moveFlow.kind === "confirmingRestore" && (
        <div className="dialog-backdrop">
          <div
            role="dialog"
            aria-label={t.areaDetail.linkRestoredPrompt}
            className="area-detail-restore-dialog"
          >
            <p>{t.areaDetail.linkRestoredPrompt}</p>
            <button onClick={handleMoveRestoreYes}>{t.areaDetail.yes}</button>
            <button onClick={handleMoveRestoreNo}>{t.areaDetail.no}</button>
          </div>
        </div>
      )}

      {buildingDialog && (
        <BuildingEditDialog
          mode={buildingDialog.mode}
          initialLabel={
            buildingDialog.mode === "edit" ? buildingDialog.building.label : ""
          }
          initialAddress={
            buildingDialog.mode === "edit"
              ? buildingDialog.building.address
              : ""
          }
          initialDescription={
            buildingDialog.mode === "edit"
              ? buildingDialog.building.description
              : ""
          }
          initialRooms={
            buildingDialog.mode === "edit"
              ? rooms.filter(
                  (r) =>
                    r.parentId === buildingDialog.building.id && !r.deletedAt,
                )
              : []
          }
          onSave={handleBuildingDialogSave}
          onCancel={() => setBuildingDialog(null)}
        />
      )}

      {deleteTargetId && (
        <DeletePlaceConfirmDialog
          onConfirm={handleDeleteConfirm}
          onCancel={() => setDeleteTargetId(null)}
        />
      )}

      {pendingBuildingDelete && (
        <div className="dialog-backdrop">
          <div
            role="dialog"
            aria-label={t.areaDetail.buildingConfirmDeleteCascade}
            className="delete-place-confirm-dialog"
          >
            <p>
              {t.areaDetail.buildingConfirmDeleteCascade.replace(
                "{count}",
                String(buildingRoomCount(pendingBuildingDelete.id)),
              )}
            </p>
            <button onClick={() => setPendingBuildingDelete(null)}>
              {t.areaDetail.cancel}
            </button>
            <button onClick={handleBuildingDeleteConfirm}>
              {t.areaDetail.deletePlace}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
