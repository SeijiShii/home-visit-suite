import { useEffect, useState } from "react";
import { useI18n } from "../contexts/I18nContext";
import { lastVisitColorClass } from "../lib/visit-date-color";
import type { Place } from "../services/place-service";
import {
  PLACE_EDIT_REQUEST_KINDS,
  editKindLabel,
  type PlaceEditRequestKind,
} from "./VisitRecordDialog";

export interface BuildingVisitDialogProps {
  buildingLabel: string;
  buildingAddress: string;
  buildingDescription: string;
  /** 部屋一覧（sortOrder 昇順、論理削除済みは除外済みを期待） */
  rooms: readonly Place[];
  /** roomId → 自分の最終訪問日（任意の Result、無ければ null） */
  roomLastVisitMap: ReadonlyMap<string, Date | null>;
  onSelectRoom: (room: Place) => void;
  /**
   * 「編集をリクエスト」送信時。種別（要削除/要移動/その他）と詳細テキスト。
   * 仕様 docs/wants/07_通知と申請.md「場所操作の権限 / 申請種別」
   */
  onPlaceEditRequest: (kind: PlaceEditRequestKind, text: string) => void;
  onCancel: () => void;
}

function formatDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}/${m}/${day}`;
}

export function BuildingVisitDialog({
  buildingLabel,
  buildingAddress,
  buildingDescription,
  rooms,
  roomLastVisitMap,
  onSelectRoom,
  onPlaceEditRequest,
  onCancel,
}: BuildingVisitDialogProps) {
  const { t } = useI18n();
  const [editOpen, setEditOpen] = useState(false);
  const [editKind, setEditKind] = useState<PlaceEditRequestKind>("other");
  const [editText, setEditText] = useState("");

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onCancel]);

  const openEdit = () => {
    setEditKind("other");
    setEditText("");
    setEditOpen(true);
  };

  const submitEdit = () => {
    if (editText.trim().length === 0) return;
    onPlaceEditRequest(editKind, editText);
    setEditOpen(false);
    setEditText("");
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
          className="building-visit-edit-request"
          onClick={openEdit}
        >
          {t.visitRecord.placeEditRequestButton}
        </button>
      </div>

      {editOpen && (
        <div
          role="dialog"
          aria-label={t.visitRecord.placeEditDialogTitle}
          className="building-visit-edit-dialog"
        >
          <h4>{t.visitRecord.placeEditDialogTitle}</h4>
          <label className="building-visit-edit-field">
            <span>{t.visitRecord.placeEditKindLabel}</span>
            <select
              value={editKind}
              onChange={(e) =>
                setEditKind(e.target.value as PlaceEditRequestKind)
              }
            >
              {PLACE_EDIT_REQUEST_KINDS.map((k) => (
                <option key={k} value={k}>
                  {editKindLabel(k, t)}
                </option>
              ))}
            </select>
          </label>
          <label className="building-visit-edit-field">
            <span>{t.visitRecord.placeEditTextLabel}</span>
            <textarea
              value={editText}
              onChange={(e) => setEditText(e.target.value)}
              placeholder={t.visitRecord.placeEditTextPlaceholder}
              rows={4}
              autoFocus
            />
          </label>
          <div className="building-visit-edit-actions">
            <button type="button" onClick={() => setEditOpen(false)}>
              {t.areaDetail.cancel}
            </button>
            <button
              type="button"
              onClick={submitEdit}
              disabled={editText.trim().length === 0}
            >
              {t.visitRecord.placeEditSubmit}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
