import { useEffect, useState } from "react";
import { useI18n } from "../contexts/I18nContext";
import { lastVisitColorClass } from "../lib/visit-date-color";
import type { Place } from "../services/place-service";
import {
  buildRoomRows,
  roomRowsUnchanged,
  type RoomRow,
} from "../lib/building-flow";
import { RoomRowsEditor } from "./RoomRowsEditor";
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
   * 部屋編集モードの「確定」時に編集後の行リストを一括保存する。
   * baseExistingIds は編集開始時に行として提示した Room の ID 集合で、
   * 差分適用の削除・変更をこの範囲に限定する（編集中の同期受信分を
   * 巻き添えにしない。docs/wants/08）。
   * 全メンバー・全端末（タッチ含む）が editable モードで利用できる。
   * 未指定なら「部屋を編集」リンクを表示しない（read-only 等）。
   */
  onSaveRooms?: (rows: RoomRow[], baseExistingIds: string[]) => void;
  /**
   * 「建物の編集をリクエスト」送信時。種別（要削除/要移動/その他）と詳細テキスト。
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
  onSaveRooms,
  onPlaceEditRequest,
  onCancel,
}: BuildingVisitDialogProps) {
  const { t } = useI18n();
  const [editOpen, setEditOpen] = useState(false);
  const [editKind, setEditKind] = useState<PlaceEditRequestKind>("other");
  const [editText, setEditText] = useState("");
  // 部屋編集モード（通常表示と分離。UI は集合住宅編集ダイアログと共通の
  // RoomRowsEditor、保存は「確定」で一括適用。仕様 docs/wants/08）
  const [roomRows, setRoomRows] = useState<RoomRow[] | null>(null);
  const [initialRoomRows, setInitialRoomRows] = useState<RoomRow[]>([]);
  const [discardConfirmOpen, setDiscardConfirmOpen] = useState(false);

  const roomEditMode = roomRows !== null;
  const roomsDirty =
    roomRows !== null && !roomRowsUnchanged(initialRoomRows, roomRows);

  const enterRoomEditMode = () => {
    const rows = buildRoomRows(rooms);
    setInitialRoomRows(rows);
    setRoomRows(rows);
  };

  const exitRoomEditMode = () => {
    setRoomRows(null);
    setDiscardConfirmOpen(false);
  };

  const submitRoomEdit = () => {
    if (roomRows === null) return;
    if (roomsDirty) {
      const baseExistingIds = initialRoomRows
        .map((r) => r.existingId)
        .filter((id): id is string => id !== null);
      onSaveRooms?.(roomRows, baseExistingIds);
    }
    exitRoomEditMode();
  };

  const requestCancelRoomEdit = () => {
    if (roomsDirty) {
      setDiscardConfirmOpen(true);
      return;
    }
    exitRoomEditMode();
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (editOpen) {
        setEditOpen(false);
        return;
      }
      if (discardConfirmOpen) {
        setDiscardConfirmOpen(false);
        return;
      }
      if (roomEditMode) {
        requestCancelRoomEdit();
        return;
      }
      onCancel();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  });

  const openEdit = () => {
    setEditKind("other");
    setEditText("");
    setEditOpen(true);
  };

  // 詳細テキストは原則必須。要削除のみ任意（仕様 docs/wants/08「編集をリクエスト」）
  const editTextRequired = editKind !== "delete";

  const submitEdit = () => {
    if (editTextRequired && editText.trim().length === 0) return;
    onPlaceEditRequest(editKind, editText.trim());
    setEditOpen(false);
    setEditText("");
  };

  return (
    <div className="dialog-backdrop">
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
          {roomEditMode ? (
            <RoomRowsEditor
              rows={roomRows}
              onRowsChange={setRoomRows}
              allowReorder={false}
            />
          ) : rooms.length === 0 ? (
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

        {/* 下部アクション行: 閉じる（編集モード中はキャンセル）→
            部屋を編集（編集モード中は確定）→ 右端に建物の編集をリクエスト
            （仕様 docs/wants/08） */}
        <div className="building-visit-actions">
          <div className="building-visit-actions-left">
            {roomEditMode ? (
              <button
                type="button"
                className="building-visit-cancel"
                onClick={requestCancelRoomEdit}
              >
                {t.areaDetail.cancel}
              </button>
            ) : (
              <button
                type="button"
                className="building-visit-cancel"
                onClick={onCancel}
              >
                {t.visitRecord.close}
              </button>
            )}
            {onSaveRooms && !roomEditMode && (
              <button
                type="button"
                className="building-visit-rooms-edit-link"
                onClick={enterRoomEditMode}
              >
                {t.visitRecord.buildingRoomsEditLink}
              </button>
            )}
            {roomEditMode && (
              <button
                type="button"
                className="btn btn-sm btn-primary building-visit-room-edit-done"
                onClick={submitRoomEdit}
              >
                {t.visitRecord.buildingRoomsEditDone}
              </button>
            )}
          </div>
          <button
            type="button"
            className="building-visit-edit-request"
            onClick={openEdit}
          >
            {t.visitRecord.buildingEditRequestButton}
          </button>
        </div>

        {editOpen && (
          // 実バックドロップで背後の行操作を遮断する（対象すり替え防止）
          <div className="dialog-backdrop">
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
                <span>
                  {t.visitRecord.placeEditTextLabel}
                  {!editTextRequired && (
                    <>（{t.areaDetail.addPlaceOptional}）</>
                  )}
                </span>
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
                  disabled={editTextRequired && editText.trim().length === 0}
                >
                  {t.visitRecord.placeEditSubmit}
                </button>
              </div>
            </div>
          </div>
        )}

        {discardConfirmOpen && (
          // 実バックドロップで背後の行操作を遮断する
          <div className="dialog-backdrop">
            <div
              role="dialog"
              aria-label={t.visitRecord.buildingRoomsDiscardConfirm}
              className="building-visit-edit-dialog"
            >
              <p>{t.visitRecord.buildingRoomsDiscardConfirm}</p>
              <div className="building-visit-edit-actions">
                <button
                  type="button"
                  onClick={() => setDiscardConfirmOpen(false)}
                >
                  {t.areaDetail.no}
                </button>
                <button type="button" onClick={exitRoomEditMode}>
                  {t.areaDetail.yes}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
