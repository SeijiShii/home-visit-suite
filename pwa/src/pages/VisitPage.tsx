import { useCallback, useEffect, useRef, useState } from "react";
import type { NetworkPolygonEditor } from "map-polygon-editor";
import { useI18n } from "../contexts/I18nContext";
import { MapView, type MapViewHandle } from "../components/MapView";
import { BuildingVisitDialog } from "../components/BuildingVisitDialog";
import { AreaDetailContextMenu } from "../components/AreaDetailContextMenu";
import { AddPlaceInputDialog } from "../components/AddPlaceInputDialog";
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
import { nextSortOrder } from "../lib/place-sort-order";
import type { PolygonGeoSource } from "../lib/area-detail-controller";
import {
  useAreaDetailMap,
  type UseAreaDetailMapPlaceService,
  type UseAreaDetailMapSettingsService,
} from "../hooks/useAreaDetailMap";

/** 直接作成に savePlace が必須（一般スタッフの場所直接追加。docs/wants/08） */
export type VisitPagePlaceServiceLike = UseAreaDetailMapPlaceService & {
  savePlace: (place: Place) => Promise<Place>;
};

export type VisitPageVisitServiceLike = Pick<
  VisitServiceClass,
  | "recordVisit"
  | "recordVisitPhase1"
  | "listMyVisitHistory"
  | "getLastMetDate"
  | "deleteVisitRecord"
>;

export interface VisitPageProps {
  /** Phase 1 暫定: 固定の区域 ID（NRT-001-01） */
  areaId: string;
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
   * 区域レベルのアクセスモード。仕様 docs/wants/05_チェックアウト.md「アクセスモード」
   * 未指定の場合は editable 扱い（後方互換）。
   */
  accessMode?: "editable" | "read_only";
  /** read-only 時、他者がアクティブにチェックアウト中ならその担当者名（表示用） */
  activeCheckoutOwnerName?: string | null;
  /** [この区域をチェックアウトして記録する] CTA。アクティブなチェックアウトが無いケース */
  onSelfCheckout?: () => void | Promise<void>;
  /** [強制回収して自分でチェックアウト] CTA。他者のアクティブなチェックアウトを強制回収 */
  onForceReclaimAndSelfCheckout?: () => void | Promise<void>;
  /** [招待を依頼] CTA — 現フェーズはプレースホルダ（仕様 09 ペンディング） */
  onRequestInvite?: () => void;
}

type DialogState =
  | { kind: "house"; place: Place; parent?: Place }
  | { kind: "building"; place: Place }
  // 一般スタッフの場所直接追加（docs/wants/08「場所の直接追加」）
  | { kind: "add-house"; lat: number; lng: number }
  | { kind: "add-building"; lat: number; lng: number }
  | null;

/** 空白ロングタップ時の「家/集合住宅を追加」選択メニュー */
type BlankMenuState = {
  lat: number;
  lng: number;
  x: number;
  y: number;
} | null;

export function VisitPage({
  areaId,
  actorId,
  placeService,
  visitService,
  editor,
  polygonToArea,
  linkedPolygonIds,
  settingsService,
  onPlaceEditRequest,
  accessMode = "editable",
  activeCheckoutOwnerName = null,
  onSelfCheckout,
  onForceReclaimAndSelfCheckout,
  onRequestInvite,
}: VisitPageProps) {
  const { t } = useI18n();
  const mapRef = useRef<MapViewHandle | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [dialog, setDialog] = useState<DialogState>(null);
  const [blankMenu, setBlankMenu] = useState<BlankMenuState>(null);
  const [lastMetDate, setLastMetDate] = useState<Date | null>(null);
  const [myHistory, setMyHistory] = useState<VisitRecord[]>([]);
  const [refreshKey, setRefreshKey] = useState(0);
  const bumpRefresh = useCallback(() => setRefreshKey((k) => k + 1), []);

  const { places, rooms } = useAreaDetailMap({
    mapRef,
    containerRef,
    editor,
    polygonToArea,
    areaId,
    placeService,
    settingsService,
    linkedPolygonIds,
    refreshKey,
    noNameLabel: t.areaDetail.noName,
  });

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
    },
    [visitService, actorId, areaId],
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

  const handleMapContextMenu = useCallback(
    (lat: number, lng: number, x: number, y: number) => {
      // 空白部分の長押し/右クリック → 「家/集合住宅を追加」選択メニューを開く。
      // 場所アイコン上の contextmenu は MapRenderer 側で stopPropagation
      // されているため、ここには到達しない（ドラッグ移動・直接削除は提供しない）。
      // 仕様 docs/wants/08「場所の直接追加」
      setBlankMenu({ lat, lng, x, y });
    },
    [],
  );

  // 「家を追加」→ 家追加ダイアログ。区域内制約は課さず当該区域へ帰属させる
  // （docs/wants/03「住宅マーカーの区域帰属」）。
  const handleAddHouse = useCallback(() => {
    if (!blankMenu) return;
    const { lat, lng } = blankMenu;
    setBlankMenu(null);
    setDialog({ kind: "add-house", lat, lng });
  }, [blankMenu]);

  const handleAddBuilding = useCallback(() => {
    if (!blankMenu) return;
    const { lat, lng } = blankMenu;
    setBlankMenu(null);
    setDialog({ kind: "add-building", lat, lng });
  }, [blankMenu]);

  const handleAddHouseSave = useCallback(
    async (values: { address: string; label: string }) => {
      if (dialog?.kind !== "add-house") return;
      const { lat, lng } = dialog;
      setDialog(null);
      const nowIso = new Date().toISOString();
      try {
        await placeService.savePlace({
          id: "",
          areaId,
          coord: { lat, lng },
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
          restoredFromId: null,
        });
      } catch (err) {
        console.error("[VisitPage] add house failed:", err);
      }
      bumpRefresh();
    },
    [dialog, placeService, areaId, places, bumpRefresh],
  );

  const handleAddBuildingSave = useCallback(
    async (args: BuildingDialogSaveArgs) => {
      if (dialog?.kind !== "add-building") return;
      const { lat, lng } = dialog;
      setDialog(null);
      const nowIso = new Date().toISOString();
      try {
        const building = await placeService.savePlace({
          id: "",
          areaId,
          coord: { lat, lng },
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
          await placeService.savePlace({
            id: "",
            areaId,
            coord: { lat: 0, lng: 0 },
            type: "room",
            label: "",
            displayName: args.rows[i].displayName,
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
      } catch (err) {
        console.error("[VisitPage] add building failed:", err);
      }
      bumpRefresh();
    },
    [dialog, placeService, areaId, places, bumpRefresh],
  );

  const isReadOnly = accessMode === "read_only";

  const handleForceReclaim = useCallback(() => {
    if (!onForceReclaimAndSelfCheckout) return;
    if (!window.confirm(t.visitRecord.checkoutForceConfirm)) return;
    void onForceReclaimAndSelfCheckout();
  }, [onForceReclaimAndSelfCheckout, t.visitRecord.checkoutForceConfirm]);

  const handleRequestInviteClick = useCallback(() => {
    if (onRequestInvite) {
      onRequestInvite();
      return;
    }
    // フォールバック（Phase G7 ではプレースホルダ）
    window.alert(t.visitRecord.checkoutInviteRequestPending);
  }, [onRequestInvite, t.visitRecord.checkoutInviteRequestPending]);

  return (
    <div className="visit-page">
      <header className="visit-page-header">
        <h2>{t.visitRecord.pageTitle}</h2>
        <p className="visit-page-banner">
          {t.visitRecord.phase1Banner.replace("{areaId}", areaId)}
        </p>
      </header>

      {isReadOnly && (
        <section className="visit-page-readonly-cta" role="region">
          <p className="visit-page-readonly-message">
            {t.visitRecord.readOnlyBanner}
            {activeCheckoutOwnerName && (
              <>
                {" "}
                <span className="visit-page-readonly-owner">
                  {t.visitRecord.checkoutOthersActive(activeCheckoutOwnerName)}
                </span>
              </>
            )}
          </p>
          <div className="visit-page-readonly-actions">
            {activeCheckoutOwnerName ? (
              <>
                <button
                  type="button"
                  className="btn"
                  onClick={handleRequestInviteClick}
                >
                  {t.visitRecord.checkoutRequestInviteCta}
                </button>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={handleForceReclaim}
                >
                  {t.visitRecord.checkoutForceCta}
                </button>
              </>
            ) : (
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => onSelfCheckout && void onSelfCheckout()}
                disabled={!onSelfCheckout}
              >
                {t.visitRecord.checkoutSelfCta}
              </button>
            )}
          </div>
        </section>
      )}

      <div
        ref={containerRef}
        className="visit-page-map"
        data-testid="visit-page-map"
      >
        {editor && polygonToArea && (
          <MapView ref={mapRef} onContextMenu={handleMapContextMenu} />
        )}
        {blankMenu && (
          <AreaDetailContextMenu
            x={blankMenu.x}
            y={blankMenu.y}
            variant="blank"
            onAddHouse={handleAddHouse}
            onAddBuilding={handleAddBuilding}
            onClose={() => setBlankMenu(null)}
          />
        )}
      </div>

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
              readOnly={isReadOnly}
              readOnlyHint={
                isReadOnly ? t.visitRecord.dialogReadOnlyHint : undefined
              }
            />
          );
        })()}

      {dialog?.kind === "building" && (
        <BuildingVisitDialog
          buildingLabel={dialog.place.label || t.areaDetail.noName}
          buildingAddress={dialog.place.address}
          buildingDescription={dialog.place.description}
          rooms={rooms.filter((r) => r.parentId === dialog.place.id)}
          roomLastVisitMap={new Map()}
          onSelectRoom={openRoomDialog}
          onPlaceEditRequest={(kind, text) =>
            onPlaceEditRequest(dialog.place.id, kind, text)
          }
          onCancel={closeDialog}
        />
      )}

      {dialog?.kind === "add-house" && (
        <AddPlaceInputDialog
          onSave={handleAddHouseSave}
          onCancel={closeDialog}
        />
      )}

      {dialog?.kind === "add-building" && (
        <BuildingEditDialog
          mode="create"
          onSave={handleAddBuildingSave}
          onCancel={closeDialog}
        />
      )}
    </div>
  );
}
