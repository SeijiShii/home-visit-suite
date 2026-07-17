import { useEffect, useState } from "react";
import { useI18n } from "../contexts/I18nContext";
import type { Place } from "../services/place-service";
import { buildRoomRows, type RoomRow } from "../lib/building-flow";
import { RoomRowsEditor } from "./RoomRowsEditor";

export type BuildingDialogMode = "create" | "edit";

export interface BuildingDialogSaveArgs {
  label: string;
  address: string;
  description: string;
  rows: RoomRow[];
  /**
   * ダイアログを開いた時点で行として提示した Room の ID 集合。
   * 差分適用の削除・変更をこの範囲に限定する（編集中の同期受信分を
   * 巻き添えにしない。docs/wants/08）。
   */
  baseRoomIds: string[];
}

export interface BuildingEditDialogProps {
  mode: BuildingDialogMode;
  initialLabel?: string;
  initialAddress?: string;
  initialDescription?: string;
  /** 編集モードで既存の Room (`type="room"`, `DeletedAt==null`) を sortOrder 昇順で渡す */
  initialRooms?: readonly Place[];
  onSave: (args: BuildingDialogSaveArgs) => void;
  onCancel: () => void;
}

export function BuildingEditDialog({
  mode,
  initialLabel = "",
  initialAddress = "",
  initialDescription = "",
  initialRooms,
  onSave,
  onCancel,
}: BuildingEditDialogProps) {
  const { t } = useI18n();
  const [label, setLabel] = useState(initialLabel);
  const [address, setAddress] = useState(initialAddress);
  const [description, setDescription] = useState(initialDescription);
  const [rows, setRows] = useState<RoomRow[]>(() =>
    buildRoomRows(initialRooms),
  );
  const [baseRoomIds] = useState<string[]>(() =>
    (initialRooms ?? []).map((r) => r.id),
  );

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

  const handleSave = () => {
    onSave({ label, address, description, rows, baseRoomIds });
  };

  return (
    <div className="dialog-backdrop">
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
        <label className="building-edit-dialog-field">
          <span>
            {t.areaDetail.addBuildingDescriptionLabel}
            <span className="add-place-input-dialog-optional">
              （{t.areaDetail.addPlaceOptional}）
            </span>
          </span>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={t.areaDetail.addBuildingDescriptionPlaceholder}
            rows={3}
          />
        </label>
        <fieldset className="building-edit-dialog-rooms">
          <legend>{t.areaDetail.buildingRoomsLabel}</legend>
          <RoomRowsEditor rows={rows} onRowsChange={setRows} allowReorder />
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
      </form>
    </div>
  );
}
