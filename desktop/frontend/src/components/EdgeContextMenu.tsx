import { useEffect, useRef } from "react";

interface EdgeContextMenuProps {
  x: number;
  y: number;
  onAddVertex: () => void;
  onClose: () => void;
}

export function EdgeContextMenu({
  x,
  y,
  onAddVertex,
  onClose,
}: EdgeContextMenuProps) {
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
      className="edge-context-menu"
      style={{ position: "absolute", left: `${x}px`, top: `${y}px` }}
      onClick={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <button
        role="menuitem"
        className="edge-context-menu-item"
        onClick={() => {
          onAddVertex();
          onClose();
        }}
      >
        頂点の追加
      </button>
    </div>
  );
}
