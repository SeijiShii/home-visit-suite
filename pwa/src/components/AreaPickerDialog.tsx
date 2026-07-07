import { useState } from "react";
import { useI18n } from "../contexts/I18nContext";
import type { AreaTreeNode } from "../services/region-service";

interface AreaPickerDialogProps {
  open: boolean;
  tree: AreaTreeNode[];
  linkedAreaIds: Set<string>;
  onSelect: (areaId: string, areaLabel: string) => void;
  onClose: () => void;
}

export function AreaPickerDialog({
  open,
  tree,
  linkedAreaIds,
  onSelect,
  onClose,
}: AreaPickerDialogProps) {
  const { t } = useI18n();
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const toggle = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  if (!open) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal area-picker-dialog"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="modal-title">{t.map.selectArea}</h3>
        <div className="area-picker-body">
          {tree.map((region) => (
            <div key={region.id} className="area-picker-region">
              <div
                className="area-picker-group-label area-picker-toggle"
                onClick={() => toggle(region.id)}
              >
                <span className="area-picker-arrow">
                  {expanded.has(region.id) ? "▼" : "▶"}
                </span>
                {region.symbol} ({region.name})
              </div>
              {expanded.has(region.id) &&
                region.parentAreas.map((pa) => (
                  <div key={pa.id} className="area-picker-parent">
                    <div
                      className="area-picker-group-label area-picker-parent-label area-picker-toggle"
                      onClick={() => toggle(pa.id)}
                    >
                      <span className="area-picker-arrow">
                        {expanded.has(pa.id) ? "▼" : "▶"}
                      </span>
                      {pa.number} {pa.name}
                    </div>
                    {expanded.has(pa.id) &&
                      pa.areas.map((area) => {
                        const isLinked = linkedAreaIds.has(area.id);
                        return (
                          <div
                            key={area.id}
                            className={`area-picker-item${isLinked ? " area-picker-item-disabled" : ""}`}
                            title={
                              isLinked ? t.map.areaAlreadyLinked : undefined
                            }
                            onClick={() => {
                              if (!isLinked) onSelect(area.id, area.id);
                            }}
                          >
                            {area.id}
                          </div>
                        );
                      })}
                  </div>
                ))}
            </div>
          ))}
        </div>
        <div className="modal-actions">
          <button className="modal-btn" onClick={onClose}>
            {t.common.cancel}
          </button>
        </div>
      </div>
    </div>
  );
}
