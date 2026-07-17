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
   * 部屋の直接操作（追加/部屋番号編集/削除）。全メンバー・全端末（タッチ含む）が
   * editable モードで利用できる。未指定なら操作 UI を表示しない（read-only 等）。
   * 仕様 docs/wants/08「集合住宅訪問ダイアログ／部屋の追加・編集・削除」
   */
  onAddRoom?: (displayName: string) => void;
  onRenameRoom?: (room: Place, displayName: string) => void;
  onDeleteRoom?: (room: Place) => void;
  /**
   * 「編集をリクエスト」送信時。種別（要削除/要移動/その他）と詳細テキスト。
   * 仕様 docs/wants/07_通知と申請.md「場所操作の権限 / 申請種別」
   */
  onPlaceEditRequest: (kind: PlaceEditRequestKind, text: string) => void;
  onCancel: () => void;
}

/** 部屋番号入力の小ダイアログの状態（追加 or 既存部屋の番号編集） */
type RoomEditorState = { mode: "add" } | { mode: "edit"; room: Place };

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
  onAddRoom,
  onRenameRoom,
  onDeleteRoom,
  onPlaceEditRequest,
  onCancel,
}: BuildingVisitDialogProps) {
  const { t } = useI18n();
  const [editOpen, setEditOpen] = useState(false);
  const [editKind, setEditKind] = useState<PlaceEditRequestKind>("other");
  const [editText, setEditText] = useState("");
  const [roomEditor, setRoomEditor] = useState<RoomEditorState | null>(null);
  const [roomNumberInput, setRoomNumberInput] = useState("");
  const [roomDeleteTarget, setRoomDeleteTarget] = useState<Place | null>(null);
  // 部屋編集モード（通常表示と分離。仕様 docs/wants/08「部屋の追加・編集・削除」）
  const [roomEditMode, setRoomEditMode] = useState(false);
  const roomOpsAvailable = !!(onAddRoom || onRenameRoom || onDeleteRoom);

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

  const openRoomAdd = () => {
    setRoomNumberInput("");
    setRoomEditor({ mode: "add" });
  };

  const openRoomEdit = (room: Place) => {
    setRoomNumberInput(room.displayName);
    setRoomEditor({ mode: "edit", room });
  };

  // 部屋番号は必須（空欄の部屋行が必要な場合は集合住宅編集ダイアログで扱う）
  const roomNumberTrimmed = roomNumberInput.trim();

  const submitRoomEditor = () => {
    if (!roomEditor || roomNumberTrimmed.length === 0) return;
    if (roomEditor.mode === "add") {
      onAddRoom?.(roomNumberTrimmed);
    } else {
      onRenameRoom?.(roomEditor.room, roomNumberTrimmed);
    }
    setRoomEditor(null);
  };

  const confirmRoomDelete = () => {
    if (roomDeleteTarget) onDeleteRoom?.(roomDeleteTarget);
    setRoomDeleteTarget(null);
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
          {rooms.length === 0 ? (
            <p className="building-visit-rooms-empty">
              {t.visitRecord.buildingRoomsEmpty}
            </p>
          ) : (
            <ul className="building-visit-room-list" role="list">
              {rooms.map((room) => {
                const lastVisit = roomLastVisitMap.get(room.id) ?? null;
                // 編集モードでは行タップ（部屋訪問ダイアログ）を無効化し
                // ✎/× ボタンのみ受け付ける（記録フローとの誤操作分離）
                const rowInteractive = !roomEditMode;
                return (
                  <li
                    key={room.id}
                    data-testid="room-row"
                    className={`building-visit-room-row${roomEditMode ? " editing" : ""}`}
                    role={rowInteractive ? "button" : undefined}
                    tabIndex={rowInteractive ? 0 : undefined}
                    onClick={
                      rowInteractive ? () => onSelectRoom(room) : undefined
                    }
                    onKeyDown={
                      rowInteractive
                        ? (e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              onSelectRoom(room);
                            }
                          }
                        : undefined
                    }
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
                    {roomEditMode && onRenameRoom && (
                      <button
                        type="button"
                        className="btn btn-sm building-visit-room-action"
                        aria-label={t.visitRecord.buildingRoomEdit}
                        onClick={() => openRoomEdit(room)}
                      >
                        ✎
                      </button>
                    )}
                    {roomEditMode && onDeleteRoom && (
                      <button
                        type="button"
                        className="btn btn-sm building-visit-room-action"
                        aria-label={t.visitRecord.buildingRoomDelete}
                        onClick={() => setRoomDeleteTarget(room)}
                      >
                        ×
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
          {roomOpsAvailable && !roomEditMode && (
            <button
              type="button"
              className="building-visit-rooms-edit-link"
              onClick={() => setRoomEditMode(true)}
            >
              {t.visitRecord.buildingRoomsEditLink}
            </button>
          )}
          {roomEditMode && (
            <div className="building-visit-room-edit-actions">
              {onAddRoom && (
                <button
                  type="button"
                  className="btn btn-sm building-visit-room-add"
                  onClick={openRoomAdd}
                >
                  {t.visitRecord.buildingRoomAdd}
                </button>
              )}
              <button
                type="button"
                className="btn btn-sm btn-primary building-visit-room-edit-done"
                onClick={() => setRoomEditMode(false)}
              >
                {t.visitRecord.buildingRoomsEditDone}
              </button>
            </div>
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

        {roomEditor && (
          // 実バックドロップで背後の行操作を遮断する（対象すり替え防止）
          <div className="dialog-backdrop">
            <div
              role="dialog"
              aria-label={
                roomEditor.mode === "add"
                  ? t.visitRecord.buildingRoomAdd
                  : t.visitRecord.buildingRoomEdit
              }
              className="building-visit-edit-dialog"
            >
              <h4>
                {roomEditor.mode === "add"
                  ? t.visitRecord.buildingRoomAdd
                  : t.visitRecord.buildingRoomEdit}
              </h4>
              <label className="building-visit-edit-field">
                <span>{t.areaDetail.buildingRoomNumberPlaceholder}</span>
                <input
                  type="text"
                  value={roomNumberInput}
                  onChange={(e) => setRoomNumberInput(e.target.value)}
                  placeholder={t.areaDetail.buildingRoomNumberPlaceholder}
                  autoFocus
                />
              </label>
              <div className="building-visit-edit-actions">
                <button type="button" onClick={() => setRoomEditor(null)}>
                  {t.areaDetail.cancel}
                </button>
                <button
                  type="button"
                  onClick={submitRoomEditor}
                  disabled={roomNumberTrimmed.length === 0}
                >
                  {t.areaDetail.save}
                </button>
              </div>
            </div>
          </div>
        )}

        {roomDeleteTarget && (
          // 実バックドロップで背後の行操作を遮断する（対象すり替え防止）
          <div className="dialog-backdrop">
            <div
              role="dialog"
              aria-label={t.areaDetail.buildingConfirmRemoveExistingRoom}
              className="building-visit-edit-dialog"
            >
              <p>{t.areaDetail.buildingConfirmRemoveExistingRoom}</p>
              <div className="building-visit-edit-actions">
                <button type="button" onClick={() => setRoomDeleteTarget(null)}>
                  {t.areaDetail.cancel}
                </button>
                <button type="button" onClick={confirmRoomDelete}>
                  {t.areaDetail.deletePlace}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
