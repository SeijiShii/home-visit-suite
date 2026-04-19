import { useEffect, useMemo, useState } from "react";
import { useI18n } from "../contexts/I18nContext";
import type { Place } from "../services/place-service";
import {
  addRoomRows,
  makeRoomRow,
  removeRoomRow,
  reorderRoomRows,
  type RoomRow,
} from "../lib/building-flow";

export type BuildingDialogMode = "create" | "edit";

export interface BuildingDialogSaveArgs {
  label: string;
  address: string;
  rows: RoomRow[];
}

export interface BuildingEditDialogProps {
  mode: BuildingDialogMode;
  initialLabel?: string;
  initialAddress?: string;
  /** 編集モードで既存の Room (`type="room"`, `DeletedAt==null`) を sortOrder 昇順で渡す */
  initialRooms?: readonly Place[];
  onSave: (args: BuildingDialogSaveArgs) => void;
  onCancel: () => void;
}

function buildInitialRows(rooms: readonly Place[] | undefined): RoomRow[] {
  if (!rooms || rooms.length === 0) return [makeRoomRow()];
  return [...rooms]
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((r) => ({
      key: `existing-${r.id}`,
      existingId: r.id,
      displayName: r.displayName,
    }));
}

export function BuildingEditDialog({
  mode,
  initialLabel = "",
  initialAddress = "",
  initialRooms,
  onSave,
  onCancel,
}: BuildingEditDialogProps) {
  const { t } = useI18n();
  const [label, setLabel] = useState(initialLabel);
  const [address, setAddress] = useState(initialAddress);
  const [rows, setRows] = useState<RoomRow[]>(() =>
    buildInitialRows(initialRooms),
  );
  const [pendingRemoveKey, setPendingRemoveKey] = useState<string | null>(null);
  const [dragIndex, setDragIndex] = useState<number | null>(null);

  const title =
    mode === "create"
      ? t.areaDetail.addBuildingDialogTitle
      : t.areaDetail.editBuildingDialogTitle;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onCancel]);

  const canDelete = rows.length > 1;

  const handleRemoveClick = (row: RoomRow) => {
    if (!canDelete) return;
    if (row.existingId) {
      setPendingRemoveKey(row.key);
      return;
    }
    setRows((rs) => removeRoomRow(rs, row.key));
  };

  const confirmRemove = () => {
    if (!pendingRemoveKey) return;
    setRows((rs) => removeRoomRow(rs, pendingRemoveKey));
    setPendingRemoveKey(null);
  };
  const cancelRemove = () => setPendingRemoveKey(null);

  const addN = (n: number) => setRows((rs) => addRoomRows(rs, n));

  const updateDisplayName = (key: string, value: string) => {
    setRows((rs) =>
      rs.map((r) => (r.key === key ? { ...r, displayName: value } : r)),
    );
  };

  const handleSave = () => {
    onSave({ label, address, rows });
  };

  const removedRow = useMemo(
    () => rows.find((r) => r.key === pendingRemoveKey) ?? null,
    [rows, pendingRemoveKey],
  );

  return (
    <form
      role="dialog"
      aria-label={title}
      className="building-edit-dialog"
      onSubmit={(e) => {
        e.preventDefault();
        handleSave();
      }}
    >
      <h3 className="building-edit-dialog-title">{title}</h3>
      <label className="building-edit-dialog-field">
        <span>
          {t.areaDetail.addPlaceNameLabel}
          <span className="add-place-input-dialog-optional">
            （{t.areaDetail.addPlaceOptional}）
          </span>
        </span>
        <input
          type="text"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          autoFocus
        />
      </label>
      <label className="building-edit-dialog-field">
        <span>
          {t.areaDetail.addPlaceAddressLabel}
          <span className="add-place-input-dialog-optional">
            （{t.areaDetail.addPlaceOptional}）
          </span>
        </span>
        <input
          type="text"
          value={address}
          onChange={(e) => setAddress(e.target.value)}
        />
      </label>
      <fieldset className="building-edit-dialog-rooms">
        <legend>{t.areaDetail.buildingRoomsLabel}</legend>
        <ul className="building-room-list" role="list">
          {rows.map((row, index) => (
            <li
              key={row.key}
              data-testid="room-row"
              className="building-room-row"
              draggable
              onDragStart={() => setDragIndex(index)}
              onDragOver={(e) => {
                if (dragIndex !== null && dragIndex !== index) {
                  e.preventDefault();
                }
              }}
              onDrop={(e) => {
                e.preventDefault();
                if (dragIndex !== null && dragIndex !== index) {
                  setRows((rs) => reorderRoomRows(rs, dragIndex, index));
                }
                setDragIndex(null);
              }}
              onDragEnd={() => setDragIndex(null)}
            >
              <input
                type="text"
                aria-label={t.areaDetail.buildingRoomNumberPlaceholder}
                placeholder={t.areaDetail.buildingRoomNumberPlaceholder}
                value={row.displayName}
                onChange={(e) => updateDisplayName(row.key, e.target.value)}
              />
              <button
                type="button"
                className="building-room-remove"
                aria-label={t.areaDetail.buildingRemoveRow}
                disabled={!canDelete}
                onClick={() => handleRemoveClick(row)}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
        <div className="building-room-add-actions">
          <button type="button" onClick={() => addN(1)}>
            {t.areaDetail.buildingAddOneRoom}
          </button>
          <button type="button" onClick={() => addN(5)}>
            {t.areaDetail.buildingAddFiveRooms}
          </button>
          <button type="button" onClick={() => addN(10)}>
            {t.areaDetail.buildingAddTenRooms}
          </button>
        </div>
      </fieldset>
      <div className="add-place-input-dialog-actions">
        <button
          type="button"
          className="add-place-input-dialog-cancel"
          onClick={onCancel}
        >
          {t.areaDetail.cancel}
        </button>
        <button type="submit" className="add-place-input-dialog-save">
          {t.areaDetail.save}
        </button>
      </div>
      {removedRow && (
        <div
          role="dialog"
          aria-label={t.areaDetail.buildingConfirmRemoveExistingRoom}
          className="building-room-confirm-dialog"
        >
          <p>{t.areaDetail.buildingConfirmRemoveExistingRoom}</p>
          <button type="button" onClick={cancelRemove}>
            {t.areaDetail.no}
          </button>
          <button type="button" onClick={confirmRemove}>
            {t.areaDetail.yes}
          </button>
        </div>
      )}
    </form>
  );
}
