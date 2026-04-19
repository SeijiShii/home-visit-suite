import { useMemo, useState } from "react";
import { useI18n } from "../contexts/I18nContext";
import type { Place } from "../services/place-service";

export interface PlaceListPanelProps {
  places: readonly Place[];
  open: boolean;
  onToggleOpen: (next: boolean) => void;
  onPlaceClick: (placeId: string) => void;
  /** 並び替え確定時: from/to は sortOrder 昇順に並べた後のインデックス */
  onReorder: (fromIndex: number, toIndex: number) => void;
  selectedPlaceId: string | null;
}

export function PlaceListPanel({
  places,
  open,
  onToggleOpen,
  onPlaceClick,
  onReorder,
  selectedPlaceId,
}: PlaceListPanelProps) {
  const { t } = useI18n();
  const [dragIndex, setDragIndex] = useState<number | null>(null);

  const sorted = useMemo(
    () => [...places].sort((a, b) => a.sortOrder - b.sortOrder),
    [places],
  );

  const toggleLabel = open
    ? t.areaDetail.placeListToggleClose
    : t.areaDetail.placeListToggleOpen;

  return (
    <aside
      className={`place-list-panel ${open ? "is-open" : "is-closed"}`}
      data-testid="place-list-panel"
      aria-label={t.areaDetail.placeListTitle}
    >
      <div className="place-list-panel-header">
        <button
          type="button"
          className="place-list-toggle"
          onClick={() => onToggleOpen(!open)}
          aria-label={toggleLabel}
          aria-expanded={open}
        >
          {open ? "›" : "‹"}
        </button>
        {open && (
          <span className="place-list-title">{t.areaDetail.placeListTitle}</span>
        )}
      </div>
      {open && (
        <div className="place-list-body">
          {sorted.length === 0 ? (
            <div className="place-list-empty" data-testid="place-list-empty">
              {t.areaDetail.placeListEmpty}
            </div>
          ) : (
            <ul className="place-list" role="list">
              {sorted.map((p, index) => {
                const isSelected = selectedPlaceId === p.id;
                const label = p.label.trim() || t.areaDetail.noName;
                return (
                  <li
                    key={p.id}
                    role="listitem"
                    aria-selected={isSelected}
                    className={`place-row${isSelected ? " is-selected" : ""}`}
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
                        onReorder(dragIndex, index);
                      }
                      setDragIndex(null);
                    }}
                    onDragEnd={() => setDragIndex(null)}
                    onClick={() => onPlaceClick(p.id)}
                  >
                    <span className="place-badge" data-testid="place-badge">
                      {p.sortOrder + 1}
                    </span>
                    <span
                      className={`place-type-icon place-type-${p.type}`}
                      aria-hidden="true"
                    />
                    <span className="place-row-text">
                      <span className="place-label">{label}</span>
                      {p.address.trim() && (
                        <span className="place-address">{p.address}</span>
                      )}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </aside>
  );
}
