import { useEffect, useRef } from "react";
import { useI18n } from "../contexts/I18nContext";

/**
 * 区域詳細編集モードのコンテキストメニュー。
 * 仕様: docs/wants/03_地図機能.md「区域詳細編集モード / 場所操作」
 * - variant="blank": ポリゴン内の空白右クリック → 「家を追加」
 *   （Phase 1 では集合住宅は表示しない）
 * - variant="place": 場所アイコン右クリック → 「移動」「削除」
 */
export type AreaDetailContextMenuVariant = "blank" | "place";

interface AreaDetailContextMenuProps {
  x: number;
  y: number;
  variant: AreaDetailContextMenuVariant;
  onAddHouse?: () => void;
  onMovePlace?: () => void;
  onDeletePlace?: () => void;
  onClose: () => void;
}

export function AreaDetailContextMenu({
  x,
  y,
  variant,
  onAddHouse,
  onMovePlace,
  onDeletePlace,
  onClose,
}: AreaDetailContextMenuProps) {
  const { t } = useI18n();
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleMouseDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("mousedown", handleMouseDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleMouseDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose]);

  const wrap = (fn?: () => void) => () => {
    fn?.();
    onClose();
  };

  return (
    <div
      ref={menuRef}
      role="menu"
      className="area-detail-context-menu"
      style={{ position: "absolute", left: `${x}px`, top: `${y}px` }}
      onClick={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
    >
      {variant === "blank" && (
        <button
          role="menuitem"
          className="area-detail-context-menu-item"
          onClick={wrap(onAddHouse)}
        >
          {t.areaDetail.addHouse}
        </button>
      )}
      {variant === "place" && (
        <>
          <button
            role="menuitem"
            className="area-detail-context-menu-item"
            onClick={wrap(onMovePlace)}
          >
            {t.areaDetail.movePlace}
          </button>
          <button
            role="menuitem"
            className="area-detail-context-menu-item"
            onClick={wrap(onDeletePlace)}
          >
            {t.areaDetail.deletePlace}
          </button>
        </>
      )}
    </div>
  );
}
