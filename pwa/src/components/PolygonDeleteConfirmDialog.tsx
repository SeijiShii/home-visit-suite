import { useEffect } from "react";
import { useI18n } from "../contexts/I18nContext";

interface PolygonDeleteConfirmDialogProps {
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * 頂点統合（マージ）でポリゴンが消滅するときの確認ダイアログ。
 * 仕様: docs/wants/03_地図機能.md「頂点ドラッグでの頂点統合（マージ）と
 * 退化ポリゴンの扱い / 削除の確認ダイアログ」
 * - OK → 削除確定（保存・紐付け補正は呼び出し側）
 * - キャンセル / Esc → 操作を undo してドラッグ前の状態に復元（呼び出し側）
 */
export function PolygonDeleteConfirmDialog({
  onConfirm,
  onCancel,
}: PolygonDeleteConfirmDialogProps) {
  const { t } = useI18n();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onCancel]);

  return (
    <div className="dialog-backdrop">
      <div
        role="dialog"
        aria-label={t.map.mergeDeleteConfirm}
        className="polygon-delete-confirm-dialog"
      >
        <p>{t.map.mergeDeleteConfirm}</p>
        <div className="polygon-delete-confirm-dialog-actions">
          <button
            type="button"
            className="polygon-delete-confirm-dialog-cancel"
            onClick={onCancel}
          >
            {t.map.mergeDeleteCancel}
          </button>
          <button
            type="button"
            className="polygon-delete-confirm-dialog-confirm"
            onClick={onConfirm}
          >
            {t.map.mergeDeleteOk}
          </button>
        </div>
      </div>
    </div>
  );
}
