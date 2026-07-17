import { useMemo, useState } from "react";
import { useI18n } from "../contexts/I18nContext";
import {
  addRoomRows,
  removeRoomRow,
  reorderRoomRows,
  type RoomRow,
} from "../lib/building-flow";

/**
 * 部屋番号一覧の行エディタ（共通コンポーネント）。
 * 集合住宅編集ダイアログと訪問ダイアログの部屋編集モードで同一 UI を使う。
 * 仕様 docs/wants/03「集合住宅の追加・編集」/ 08「集合住宅訪問ダイアログ」
 *
 * - 各行 = 部屋番号入力欄 + × 削除（既存 Room 行は確認ダイアログ、行数最小 1）
 * - 下部に [+1] [+5] [+10] の空行追加
 * - D&D 並び替えは allowReorder のとき（直接編集面）のみ
 */
export interface RoomRowsEditorProps {
  rows: readonly RoomRow[];
  onRowsChange: (rows: RoomRow[]) => void;
  /** D&D 並び替えを許可する（訪問ダイアログ側では無効） */
  allowReorder?: boolean;
}

export function RoomRowsEditor({
  rows,
  onRowsChange,
  allowReorder = false,
}: RoomRowsEditorProps) {
  const { t } = useI18n();
  const [pendingRemoveKey, setPendingRemoveKey] = useState<string | null>(null);
  const [dragIndex, setDragIndex] = useState<number | null>(null);

  const canDelete = rows.length > 1;

  const handleRemoveClick = (row: RoomRow) => {
    if (!canDelete) return;
    if (row.existingId) {
      setPendingRemoveKey(row.key);
      return;
    }
    onRowsChange(removeRoomRow(rows, row.key));
  };

  const confirmRemove = () => {
    if (!pendingRemoveKey) return;
    onRowsChange(removeRoomRow(rows, pendingRemoveKey));
    setPendingRemoveKey(null);
  };
  const cancelRemove = () => setPendingRemoveKey(null);

  const addN = (n: number) => onRowsChange(addRoomRows(rows, n));

  const updateDisplayName = (key: string, value: string) => {
    onRowsChange(
      rows.map((r) => (r.key === key ? { ...r, displayName: value } : r)),
    );
  };

  const removedRow = useMemo(
    () => rows.find((r) => r.key === pendingRemoveKey) ?? null,
    [rows, pendingRemoveKey],
  );

  return (
    <>
      <ul className="building-room-list" role="list">
        {rows.map((row, index) => (
          <li
            key={row.key}
            data-testid="room-row"
            className={`building-room-row${allowReorder ? "" : " static"}`}
            draggable={allowReorder}
            onDragStart={allowReorder ? () => setDragIndex(index) : undefined}
            onDragOver={
              allowReorder
                ? (e) => {
                    if (dragIndex !== null && dragIndex !== index) {
                      e.preventDefault();
                    }
                  }
                : undefined
            }
            onDrop={
              allowReorder
                ? (e) => {
                    e.preventDefault();
                    if (dragIndex !== null && dragIndex !== index) {
                      onRowsChange(reorderRoomRows(rows, dragIndex, index));
                    }
                    setDragIndex(null);
                  }
                : undefined
            }
            onDragEnd={allowReorder ? () => setDragIndex(null) : undefined}
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
      {removedRow && (
        // 実バックドロップで背後の行操作を遮断する（L-021）
        <div className="dialog-backdrop">
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
        </div>
      )}
    </>
  );
}
