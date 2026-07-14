import { useMemo, useState } from "react";
import { useI18n } from "../contexts/I18nContext";
import type { Place } from "../services/place-service";
import type { VisitRecord, VisitResult } from "../services/visit-service";

export interface PlaceListPanelProps {
  places: readonly Place[];
  open: boolean;
  onToggleOpen: (next: boolean) => void;
  onPlaceClick: (placeId: string) => void;
  onPlaceDoubleClick?: (placeId: string) => void;
  /** 並び替え確定時: from/to は sortOrder 昇順に並べた後のインデックス */
  onReorder: (fromIndex: number, toIndex: number) => void;
  selectedPlaceId: string | null;
  /** buildingId → 生存 Room 数 (集合住宅行の右側に表示)。未指定なら 0 扱い。 */
  roomCounts?: ReadonlyMap<string, number>;
  /**
   * placeId → 訪問記録（日時降順）。指定時は行に直近記録を併記し、
   * 行クリックで記録一覧を展開する（docs/wants/03「場所一覧と訪問記録の一覧」）。
   */
  visitRecords?: ReadonlyMap<string, readonly VisitRecord[]>;
  /** 集合住宅行の展開で部屋番号を解決するための Room 一覧。 */
  rooms?: readonly Place[];
  /** D&D 並び替えの可否（直接編集権限があるときのみ true）。既定 true。 */
  reorderEnabled?: boolean;
  /** pane=右サイドペイン（既定） / overlay=全面オーバーレイ（狭幅時）。 */
  variant?: "pane" | "overlay";
}

function visitResultLabel(
  r: VisitResult,
  t: ReturnType<typeof useI18n>["t"],
): string {
  switch (r) {
    case "met":
      return t.visitRecord.resultMet;
    case "absent":
      return t.visitRecord.resultAbsent;
    case "vacant_possible":
      return t.visitRecord.resultVacantPossible;
    case "vacant_abandoned":
      return t.visitRecord.resultVacantAbandoned;
    case "refused":
      return t.visitRecord.resultRefused;
  }
}

function formatVisitDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString();
}

export function PlaceListPanel({
  places,
  open,
  onToggleOpen,
  onPlaceClick,
  onPlaceDoubleClick,
  onReorder,
  selectedPlaceId,
  roomCounts,
  visitRecords,
  rooms,
  reorderEnabled = true,
  variant = "pane",
}: PlaceListPanelProps) {
  const { t } = useI18n();
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Phase 1: room (type="room") は一覧に出さない。
  const sorted = useMemo(
    () =>
      [...places]
        .filter((p) => p.type !== "room")
        .sort((a, b) => a.sortOrder - b.sortOrder),
    [places],
  );

  const toggleLabel = open
    ? t.areaDetail.placeListToggleClose
    : t.areaDetail.placeListToggleOpen;

  const isOverlay = variant === "overlay";

  /** 場所行の展開に表示する記録（集合住宅は子 Room の記録も部屋番号付きで統合） */
  const expandedRecords = useMemo(() => {
    if (!expandedId || !visitRecords) return [];
    const list: Array<{ record: VisitRecord; roomName?: string }> = [];
    for (const r of visitRecords.get(expandedId) ?? []) {
      list.push({ record: r });
    }
    for (const room of rooms ?? []) {
      if (room.parentId !== expandedId) continue;
      for (const r of visitRecords.get(room.id) ?? []) {
        list.push({ record: r, roomName: room.displayName });
      }
    }
    return list.sort((a, b) =>
      b.record.visitedAt.localeCompare(a.record.visitedAt),
    );
  }, [expandedId, visitRecords, rooms]);

  const body = (
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
            const isBuilding = p.type === "building";
            const roomCount = isBuilding ? (roomCounts?.get(p.id) ?? 0) : 0;
            const addressText = p.address.trim();
            const latest = visitRecords
              ? (visitRecords.get(p.id)?.[0] ?? null)
              : null;
            const isExpanded = expandedId === p.id;
            const className = [
              "place-row",
              isSelected ? "is-selected" : "",
              isBuilding ? "is-building" : "",
              isExpanded ? "is-expanded" : "",
            ]
              .filter(Boolean)
              .join(" ");
            return (
              <li
                key={p.id}
                role="listitem"
                aria-selected={isSelected}
                className={className}
                draggable={reorderEnabled}
                onDragStart={() => {
                  if (reorderEnabled) setDragIndex(index);
                }}
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
                onClick={() => {
                  onPlaceClick(p.id);
                  if (visitRecords) {
                    setExpandedId((cur) => (cur === p.id ? null : p.id));
                  }
                }}
                onDoubleClick={() => onPlaceDoubleClick?.(p.id)}
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
                  {isBuilding ? (
                    <span className="place-address">
                      {`🏢 ${roomCount}${t.areaDetail.buildingRoomCountSuffix}`}
                      {addressText && ` · ${addressText}`}
                    </span>
                  ) : (
                    addressText && (
                      <span className="place-address">{addressText}</span>
                    )
                  )}
                  {visitRecords && (
                    <span
                      className="place-latest-visit"
                      data-testid="place-latest-visit"
                    >
                      {latest
                        ? `${visitResultLabel(latest.result, t)} ${formatVisitDate(latest.visitedAt)}`
                        : t.areaDetail.placeListVisitNone}
                    </span>
                  )}
                  {isExpanded && visitRecords && (
                    <ul
                      className="place-visit-records"
                      data-testid="place-visit-records"
                    >
                      {expandedRecords.length === 0 ? (
                        <li className="place-visit-record-empty">
                          {t.areaDetail.placeListVisitNone}
                        </li>
                      ) : (
                        expandedRecords.map(({ record, roomName }) => (
                          <li key={record.id} className="place-visit-record">
                            {roomName && (
                              <span className="place-visit-record-room">
                                {roomName}
                              </span>
                            )}
                            <span className="place-visit-record-result">
                              {visitResultLabel(record.result, t)}
                            </span>
                            <span className="place-visit-record-date">
                              {formatVisitDate(record.visitedAt)}
                            </span>
                          </li>
                        ))
                      )}
                    </ul>
                  )}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );

  if (isOverlay) {
    return (
      <div
        className="place-list-overlay"
        data-testid="place-list-overlay"
        role="dialog"
        aria-label={t.areaDetail.placeListTitle}
      >
        <div className="place-list-overlay-header">
          <span className="place-list-title">
            {t.areaDetail.placeListTitle}
          </span>
          <button
            type="button"
            className="btn btn-sm"
            onClick={() => onToggleOpen(false)}
          >
            {t.areaDetail.placeListOverlayClose}
          </button>
        </div>
        {body}
      </div>
    );
  }

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
          <span className="place-list-title">
            {t.areaDetail.placeListTitle}
          </span>
        )}
      </div>
      {open && body}
    </aside>
  );
}
