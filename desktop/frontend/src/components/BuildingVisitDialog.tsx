import { useEffect, useState } from "react";
import { useI18n } from "../contexts/I18nContext";
import { lastVisitColorClass } from "../lib/visit-date-color";
import type { Place } from "../services/place-service";

export interface BuildingVisitDialogProps {
  buildingLabel: string;
  buildingAddress: string;
  buildingDescription: string;
  /** 部屋一覧（sortOrder 昇順、論理削除済みは除外済みを期待） */
  rooms: readonly Place[];
  /** roomId → 自分の最終訪問日（任意の Result、無ければ null） */
  roomLastVisitMap: ReadonlyMap<string, Date | null>;
  onSelectRoom: (room: Place) => void;
  onPlaceModifyRequest: (text: string) => void;
  onCancel: () => void;
}

function formatDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function BuildingVisitDialog({
  buildingLabel,
  buildingAddress,
  buildingDescription,
  rooms,
  roomLastVisitMap,
  onSelectRoom,
  onPlaceModifyRequest,
  onCancel,
}: BuildingVisitDialogProps) {
  const { t } = useI18n();
  const [modifyOpen, setModifyOpen] = useState(false);
  const [modifyText, setModifyText] = useState("");

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onCancel]);

  const submitModify = () => {
    if (modifyText.trim().length === 0) return;
    onPlaceModifyRequest(modifyText);
    setModifyOpen(false);
    setModifyText("");
  };

  return (
    <div
      role="dialog"
      aria-label={t.visitRecord.buildingDialogTitle}
      className="building-visit-dialog"
    >
      <header className="building-visit-dialog-header">
        <h3>{buildingLabel}</h3>
        {buildingAddress && <p>{buildingAddress}</p>}
        {buildingDescription.length > 0 && (
          <p
            data-testid="building-description"
            className="building-visit-description"
          >
            {buildingDescription}
          </p>
        )}
      </header>

      <section className="building-visit-rooms">
        <h4>{t.visitRecord.buildingRoomsTitle}</h4>
        {rooms.length === 0 ? (
          <p className="building-visit-rooms-empty">
            {t.visitRecord.buildingRoomsEmpty}
          </p>
        ) : (
          <ul className="building-visit-room-list" role="list">
            {rooms.map((room) => {
              const lastVisit = roomLastVisitMap.get(room.id) ?? null;
              return (
                <li
                  key={room.id}
                  data-testid="room-row"
                  className="building-visit-room-row"
                  role="button"
                  tabIndex={0}
                  onClick={() => onSelectRoom(room)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      onSelectRoom(room);
                    }
                  }}
                >
                  <span className="building-visit-room-number">
                    {room.displayName || "—"}
                  </span>
                  {lastVisit && (
                    <span
                      data-testid="room-last-visit"
                      className={`building-visit-room-last ${lastVisitColorClass(lastVisit)}`}
                    >
                      {formatDate(lastVisit)}
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <div className="building-visit-actions">
        <button
          type="button"
          className="building-visit-cancel"
          onClick={onCancel}
        >
          {t.visitRecord.close}
        </button>
        <button
          type="button"
          className="building-visit-modify-request"
          onClick={() => setModifyOpen(true)}
        >
          {t.visitRecord.placeModifyRequestButton}
        </button>
      </div>

      {modifyOpen && (
        <div
          role="dialog"
          aria-label={t.visitRecord.placeModifyDialogTitle}
          className="building-visit-modify-dialog"
        >
          <h4>{t.visitRecord.placeModifyDialogTitle}</h4>
          <label>
            <span>{t.visitRecord.placeModifyTextLabel}</span>
            <textarea
              value={modifyText}
              onChange={(e) => setModifyText(e.target.value)}
              placeholder={t.visitRecord.placeModifyTextPlaceholder}
              rows={4}
              autoFocus
            />
          </label>
          <div className="building-visit-modify-actions">
            <button type="button" onClick={() => setModifyOpen(false)}>
              {t.areaDetail.cancel}
            </button>
            <button
              type="button"
              onClick={submitModify}
              disabled={modifyText.trim().length === 0}
            >
              {t.visitRecord.placeModifySubmit}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
