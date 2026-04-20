import { useCallback, useEffect, useMemo, useState } from "react";
import { useI18n } from "../contexts/I18nContext";
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

export interface VisitPagePlaceServiceLike {
  listPlaces: (areaID: string) => Promise<Place[]>;
}

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
  onPlaceCreateRequest,
  onPlaceModifyRequest,
}: VisitPageProps) {
  const { t } = useI18n();
  const [places, setPlaces] = useState<Place[]>([]);
  const [dialog, setDialog] = useState<DialogState>(null);
  const [lastMetDate, setLastMetDate] = useState<Date | null>(null);
  const [myHistory, setMyHistory] = useState<VisitRecord[]>([]);

  const reload = useCallback(async () => {
    const list = await placeService.listPlaces(areaId);
    setPlaces(list);
  }, [placeService, areaId]);

  useEffect(() => {
    reload();
  }, [reload]);

  const topLevelPlaces = useMemo(
    () => places.filter((p) => p.parentId === "" && !p.deletedAt),
    [places],
  );

  const rooms = useMemo(
    () => places.filter((p) => p.type === "room" && !p.deletedAt),
    [places],
  );

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

  const handlePlaceClick = useCallback(
    (place: Place) => {
      if (place.type === "house") {
        openHouseDialog(place);
      } else if (place.type === "building") {
        openBuildingDialog(place);
      }
    },
    [openHouseDialog, openBuildingDialog],
  );

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

  return (
    <div className="visit-page">
      <header className="visit-page-header">
        <h2>{t.visitRecord.pageTitle}</h2>
        <p className="visit-page-banner">
          {t.visitRecord.phase1Banner.replace("{areaId}", areaId)}
        </p>
      </header>

      <div className="visit-page-actions">
        <button
          type="button"
          onClick={() =>
            setDialog({ kind: "create-request", lat: 35.7, lng: 140.3 })
          }
        >
          {t.visitRecord.addPlaceCreateRequest}
        </button>
      </div>

      <section className="visit-page-places">
        {topLevelPlaces.length === 0 ? (
          <p className="visit-page-empty">{t.visitRecord.placesEmpty}</p>
        ) : (
          <ul role="list">
            {topLevelPlaces.map((p) => (
              <li
                key={p.id}
                data-testid="visit-place-row"
                role="button"
                tabIndex={0}
                className={`visit-place-row visit-place-row-${p.type}`}
                onClick={() => handlePlaceClick(p)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    handlePlaceClick(p);
                  }
                }}
              >
                <span className={`visit-place-badge type-${p.type}`}>
                  {p.type === "house" ? "家" : "集"}
                </span>
                <span className="visit-place-label">
                  {p.label || t.areaDetail.noName}
                </span>
                {p.address && (
                  <span className="visit-place-address">{p.address}</span>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

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
