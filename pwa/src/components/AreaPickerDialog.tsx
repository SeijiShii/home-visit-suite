import { useState } from "react";
import { useI18n } from "../contexts/I18nContext";
import type { AreaTreeNode } from "../services/region-service";
import { areaIdentifier } from "../domain/models/region";

interface AreaPickerDialogProps {
  open: boolean;
  tree: AreaTreeNode[];
  /** いずれかのポリゴンに紐付け済みの区域（行を不活性化し飛地追加ボタンを出す） */
  linkedAreaIds: Set<string>;
  /** 対象ポリゴン自身が既に紐付いている区域（重複紐付けを作らせないため完全に不活性） */
  boundAreaIds?: Set<string>;
  onSelect: (areaId: string, areaLabel: string) => void;
  onClose: () => void;
}

export function AreaPickerDialog({
  open,
  tree,
  linkedAreaIds,
  boundAreaIds,
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
                        // 画面に出すのは内部 ID ではなく識別子（wants 02）
                        const identifier = areaIdentifier(
                          region.symbol,
                          pa.number,
                          area.number,
                        );
                        const isLinked = linkedAreaIds.has(area.id);
                        // このポリゴン自身が既に紐付いている区域は飛地追加も不可
                        const isBoundHere = boundAreaIds?.has(area.id) ?? false;
                        return (
                          <div
                            key={area.id}
                            className={`area-picker-item${isLinked ? " area-picker-item-disabled" : ""}`}
                            title={
                              isBoundHere
                                ? t.map.areaAlreadyLinkedHere
                                : isLinked
                                  ? t.map.areaAlreadyLinked
                                  : undefined
                            }
                            onClick={() => {
                              if (!isLinked)
                                onSelect(area.id, identifier);
                            }}
                          >
                            <span className="area-picker-item-label">
                              {identifier}
                            </span>
                            {isLinked && !isBoundHere && (
                              <button
                                type="button"
                                className="area-picker-exclave-btn"
                                title={t.map.addExclavePolygon}
                                aria-label={t.map.addExclavePolygon}
                                onClick={(e) => {
                                  // 紐付け済み区域へ飛地ポリゴンとして追加紐付けする
                                  // （行自体は不活性のままボタンだけ活性）。
                                  e.stopPropagation();
                                  onSelect(area.id, identifier);
                                }}
                              >
                                {"➕"}
                              </button>
                            )}
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
