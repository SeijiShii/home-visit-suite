import { useEffect, useRef } from "react";

/**
 * ポリゴンの頂点上で右クリックしたときのコンテキストメニュー。
 * 現状は「頂点を削除」（dissolve: 両隣を再接続して頂点数を1つ減らす）を提供する。
 */
interface VertexContextMenuProps {
  x: number;
  y: number;
  /** メニュー項目のラベル（i18n 由来）。 */
  label: string;
  onDelete: () => void;
  onClose: () => void;
}

export function VertexContextMenu({
  x,
  y,
  label,
  onDelete,
  onClose,
}: VertexContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleMouseDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener("mousedown", handleMouseDown);
    return () => document.removeEventListener("mousedown", handleMouseDown);
  }, [onClose]);

  return (
    <div
      ref={menuRef}
      role="menu"
      className="vertex-context-menu"
      style={{ position: "absolute", left: `${x}px`, top: `${y}px` }}
      onClick={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <button
        role="menuitem"
        className="vertex-context-menu-item"
        onClick={() => {
          onDelete();
          onClose();
        }}
      >
        {label}
      </button>
    </div>
  );
}
