import { useCallback, useEffect, useRef, useState } from "react";
import type { NetworkPolygonEditor } from "map-polygon-editor";
import { useI18n } from "../contexts/I18nContext";
import { MapView, type MapViewHandle } from "../components/MapView";
import { BuildingVisitDialog } from "../components/BuildingVisitDialog";
import { PlaceCreateRequestDialog } from "../components/PlaceCreateRequestDialog";
import {
  VisitRecordDialog,
  type VisitRecordSaveArgs,
} from "../components/VisitRecordDialog";
import type { Place } from "../services/place-service";
import type {
  VisitRecord,
  VisitService as VisitServiceClass,
} from "../services/visit-service";
import type { PlaceCreateRequestSaveArgs } from "../components/PlaceCreateRequestDialog";
import type { PolygonGeoSource } from "../lib/area-detail-controller";
import {
  useAreaDetailMap,
  type UseAreaDetailMapPlaceService,
  type UseAreaDetailMapSettingsService,
} from "../hooks/useAreaDetailMap";

export type VisitPagePlaceServiceLike = UseAreaDetailMapPlaceService;

export type VisitPageVisitServiceLike = Pick<
  VisitServiceClass,
  "recordVisit" | "listMyVisitHistory" | "getLastMetDate" | "deleteVisitRecord"
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
  /** 場所作成申請の処理は本ページ外（申請サービス）に委譲する */
  onPlaceCreateRequest: (args: PlaceCreateRequestSaveArgs) => void;
  /** 場所修正申請の処理も外部委譲（PlaceID とテキスト） */
  onPlaceModifyRequest: (placeId: string, text: string) => void;
}

type DialogState =
  | { kind: "house"; place: Place }
  | { kind: "building"; place: Place }
  | { kind: "create-request"; lat: number; lng: number }
  | null;

export function VisitPage({
  areaId,
  actorId,
  placeService,
  visitService,
  editor,
  polygonToArea,
  linkedPolygonIds,
  settingsService,
  onPlaceCreateRequest,
  onPlaceModifyRequest,
}: VisitPageProps) {
  const { t } = useI18n();
  const mapRef = useRef<MapViewHandle | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [dialog, setDialog] = useState<DialogState>(null);
  const [lastMetDate, setLastMetDate] = useState<Date | null>(null);
  const [myHistory, setMyHistory] = useState<VisitRecord[]>([]);

  const { places, rooms } = useAreaDetailMap({
    mapRef,
    containerRef,
    editor,
    polygonToArea,
    areaId,
    placeService,
    settingsService,
    linkedPolygonIds,
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
      // Phase 1: ActivityID は未配線。空文字で送る
      await visitService.recordVisit(
        actorId,
        "",
        place.id,
        args.result,
        args.visitedAt,
        args.applicationText,
      );
      setDialog(null);
    },
    [visitService, actorId],
  );

  const closeDialog = useCallback(() => setDialog(null), []);

  // 集合住宅ダイアログから部屋を選択 → 部屋訪問ダイアログに切替
  const openRoomDialog = useCallback(
    async (room: Place) => {
      const [last, history] = await Promise.all([
        visitService.getLastMetDate(room.id),
        visitService.listMyVisitHistory(room.id, actorId),
      ]);
      setLastMetDate(last);
      setMyHistory(history);
      setDialog({ kind: "house", place: room });
    },
    [visitService, actorId],
  );

  const handleMapContextMenu = useCallback(
    (lat: number, lng: number, _x: number, _y: number) => {
      // 空白部分の長押し/右クリック → 場所作成申請ダイアログを開く。
      // 場所アイコン上の contextmenu は MapRenderer 側で stopPropagation
      // されているため、ここには到達しない。
      setDialog({ kind: "create-request", lat, lng });
    },
    [],
  );

  return (
    <div className="visit-page">
      <header className="visit-page-header">
        <h2>{t.visitRecord.pageTitle}</h2>
        <p className="visit-page-banner">
          {t.visitRecord.phase1Banner.replace("{areaId}", areaId)}
        </p>
      </header>

      <div
        ref={containerRef}
        className="visit-page-map"
        data-testid="visit-page-map"
      >
        {editor && polygonToArea && (
          <MapView ref={mapRef} onContextMenu={handleMapContextMenu} />
        )}
      </div>

      {dialog?.kind === "house" && (
        <VisitRecordDialog
          placeLabel={dialog.place.label || t.areaDetail.noName}
          placeAddress={dialog.place.address}
          placeId={dialog.place.id}
          lastMetDate={lastMetDate}
          myHistory={myHistory}
          onSave={(args) => handleSaveVisit(dialog.place, args)}
          onCancel={closeDialog}
          onPlaceModifyRequest={(text) =>
            onPlaceModifyRequest(dialog.place.id, text)
          }
        />
      )}

      {dialog?.kind === "building" && (
        <BuildingVisitDialog
          buildingLabel={dialog.place.label || t.areaDetail.noName}
          buildingAddress={dialog.place.address}
          buildingDescription={dialog.place.description}
          rooms={rooms.filter((r) => r.parentId === dialog.place.id)}
          roomLastVisitMap={new Map()}
          onSelectRoom={openRoomDialog}
          onPlaceModifyRequest={(text) =>
            onPlaceModifyRequest(dialog.place.id, text)
          }
          onCancel={closeDialog}
        />
      )}

      {dialog?.kind === "create-request" && (
        <PlaceCreateRequestDialog
          lat={dialog.lat}
          lng={dialog.lng}
          onSave={(args) => {
            onPlaceCreateRequest(args);
            setDialog(null);
          }}
          onCancel={closeDialog}
        />
      )}
    </div>
  );
}
