import { useEffect, useState } from "react";
import { useI18n } from "../contexts/I18nContext";

interface AddPlaceInputDialogProps {
  onSave: (values: { address: string; label: string }) => void;
  onCancel: () => void;
  /** 編集モード用の初期値 (未指定なら空) */
  initialLabel?: string;
  initialAddress?: string;
  /** ダイアログタイトル (未指定なら「家を追加」) */
  title?: string;
}

/**
 * 家追加・場所編集の入力ダイアログ。住所と名前を任意入力させる。
 * 仕様: docs/wants/03_地図機能.md「場所操作 / 家を追加・場所編集」
 * - 両フィールドとも空のまま保存可能
 * - Enter で保存、Esc でキャンセル
 */
export function AddPlaceInputDialog({
  onSave,
  onCancel,
  initialLabel = "",
  initialAddress = "",
  title,
}: AddPlaceInputDialogProps) {
  const { t } = useI18n();
  const [address, setAddress] = useState(initialAddress);
  const [label, setLabel] = useState(initialLabel);
  const dialogTitle = title ?? t.areaDetail.addPlaceDialogTitle;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onCancel]);

  return (
    <form
      role="dialog"
      aria-label={dialogTitle}
      className="add-place-input-dialog"
      onSubmit={(e) => {
        e.preventDefault();
        onSave({ address, label });
      }}
    >
      <h3 className="add-place-input-dialog-title">{dialogTitle}</h3>
      <label className="add-place-input-dialog-field">
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
      <label className="add-place-input-dialog-field">
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
  );
}
