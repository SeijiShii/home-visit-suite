import { useEffect } from "react";
import { useI18n } from "../contexts/I18nContext";

interface DeletePlaceConfirmDialogProps {
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * 場所削除の確認ダイアログ。
 * 仕様: docs/wants/03_地図機能.md「場所操作 / 削除」
 * - 削除は論理削除 (DeletedAt) なので確認だけ取り、実体は呼び出し側で行う
 * - Esc キーでキャンセル
 */
export function DeletePlaceConfirmDialog({
  onConfirm,
  onCancel,
}: DeletePlaceConfirmDialogProps) {
  const { t } = useI18n();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onCancel]);

  return (
    <div
      role="dialog"
      aria-label={t.areaDetail.confirmDeletePlace}
      className="delete-place-confirm-dialog"
    >
      <p>{t.areaDetail.confirmDeletePlace}</p>
      <div className="delete-place-confirm-dialog-actions">
        <button
          type="button"
          className="delete-place-confirm-dialog-cancel"
          onClick={onCancel}
        >
          {t.areaDetail.no}
        </button>
        <button
          type="button"
          className="delete-place-confirm-dialog-confirm"
          onClick={onConfirm}
        >
          {t.areaDetail.deletePlace}
        </button>
      </div>
    </div>
  );
}
