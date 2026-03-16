import { useState, useRef, useCallback } from "react";
import { useI18n } from "../contexts/I18nContext";
import type { MapPolygon, PolygonID } from "map-polygon-editor";
import type { PolygonAreaInfo } from "../services/polygon-service";

interface PolygonListProps {
  polygons: MapPolygon[];
  polygonAreaMap: Map<string, PolygonAreaInfo>;
  selectedPolygonId: PolygonID | null;
  onPolygonClick: (id: PolygonID) => void;
  onDeletePolygon: (id: PolygonID) => void;
  isDrawing: boolean;
}

export function PolygonList({
  polygons,
  polygonAreaMap,
  selectedPolygonId,
  onPolygonClick,
  onDeletePolygon,
  isDrawing,
}: PolygonListProps) {
  const { t } = useI18n();
  const [pendingDeleteId, setPendingDeleteId] = useState<PolygonID | null>(
    null,
  );
  const dialogRef = useRef<HTMLDialogElement>(null);

  const openDialog = useCallback(
    (id: PolygonID) => {
      setPendingDeleteId(id);
      dialogRef.current?.showModal();
    },
    [],
  );

  const closeDialog = useCallback(() => {
    dialogRef.current?.close();
    setPendingDeleteId(null);
  }, []);

  const confirmDelete = useCallback(() => {
    if (pendingDeleteId) {
      onDeletePolygon(pendingDeleteId);
    }
    closeDialog();
  }, [pendingDeleteId, onDeletePolygon, closeDialog]);

  if (polygons.length === 0) {
    return (
      <div className="polygon-list">
        <div className="polygon-list-body">
          <p className="polygon-list-empty">{t.common.noData}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="polygon-list">
      <div className="polygon-list-body">
        {polygons.map((poly) => {
          const polyId = poly.id as string;
          const areaInfo = polygonAreaMap.get(polyId);
          const isSelected = selectedPolygonId === poly.id;
          return (
            <div
              key={polyId}
              className={`polygon-list-item${isSelected ? " polygon-list-item-selected" : ""}`}
              onClick={() => onPolygonClick(poly.id)}
            >
              <span className="polygon-list-item-label">
                {areaInfo ? areaInfo.areaLabel : t.map.noArea}
              </span>
              <button
                className="polygon-list-delete-btn"
                disabled={isDrawing}
                onClick={(e) => {
                  e.stopPropagation();
                  openDialog(poly.id);
                }}
              >
                {t.map.deletePolygon}
              </button>
            </div>
          );
        })}
      </div>

      <dialog ref={dialogRef} className="polygon-delete-dialog">
        <p className="polygon-delete-dialog-message">
          {t.map.confirmDeletePolygon}
        </p>
        <div className="polygon-delete-dialog-actions">
          <button
            className="polygon-delete-dialog-btn polygon-delete-dialog-cancel"
            onClick={closeDialog}
          >
            {t.common.cancel}
          </button>
          <button
            className="polygon-delete-dialog-btn polygon-delete-dialog-confirm"
            onClick={confirmDelete}
          >
            {t.common.confirm}
          </button>
        </div>
      </dialog>
    </div>
  );
}
