import { useState, useRef, useCallback, useMemo, useEffect } from "react";
import { useI18n } from "../contexts/I18nContext";
import type { PolygonID, PolygonSnapshot } from "map-polygon-editor";
import type { PolygonAreaInfo } from "../services/polygon-service";
import type { AreaTreeNode } from "../services/region-service";
import { AreaPickerDialog } from "./AreaPickerDialog";

interface PolygonListProps {
  polygons: PolygonSnapshot[];
  polygonAreaMap: Map<string, PolygonAreaInfo>;
  tree: AreaTreeNode[];
  selectedPolygonId: PolygonID | null;
  onPolygonClick: (id: PolygonID) => void;
  onDeletePolygon: (snapshot: PolygonSnapshot) => void;
  onToggleActive: (id: PolygonID, active: boolean) => void;
  onToggleLocked: (id: PolygonID, locked: boolean) => void;
  onLinkPolygon: (polygonId: PolygonID, areaId: string) => void;
  onUnlinkPolygon: (polygonId: PolygonID, areaId: string) => void;
  isDrawing: boolean;
}

export function PolygonList({
  polygons,
  polygonAreaMap,
  tree,
  selectedPolygonId,
  onPolygonClick,
  onDeletePolygon,
  onToggleActive,
  onToggleLocked,
  onLinkPolygon,
  onUnlinkPolygon,
  isDrawing,
}: PolygonListProps) {
  const { t } = useI18n();
  const [pendingDelete, setPendingDelete] = useState<PolygonSnapshot | null>(
    null,
  );
  const dialogRef = useRef<HTMLDialogElement>(null);

  // リンク/リンク解除の状態
  const [linkTarget, setLinkTarget] = useState<PolygonID | null>(null);
  const [unlinkTarget, setUnlinkTarget] = useState<{
    polygonId: PolygonID;
    areaId: string;
    areaLabel: string;
  } | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // 紐付け済み区域IDのセット
  const linkedAreaIds = useMemo(() => {
    const ids = new Set<string>();
    for (const info of polygonAreaMap.values()) {
      ids.add(info.areaId);
    }
    return ids;
  }, [polygonAreaMap]);

  // トースト自動消去
  useEffect(() => {
    if (!toastMessage) return;
    const timer = setTimeout(() => setToastMessage(null), 3000);
    return () => clearTimeout(timer);
  }, [toastMessage]);

  const openDialog = useCallback((snapshot: PolygonSnapshot) => {
    setPendingDelete(snapshot);
    dialogRef.current?.showModal();
  }, []);

  const closeDialog = useCallback(() => {
    dialogRef.current?.close();
    setPendingDelete(null);
  }, []);

  const confirmDelete = useCallback(() => {
    if (pendingDelete) {
      onDeletePolygon(pendingDelete);
    }
    closeDialog();
  }, [pendingDelete, onDeletePolygon, closeDialog]);

  const handleAreaSelect = useCallback(
    (areaId: string, areaLabel: string) => {
      if (!linkTarget) return;
      onLinkPolygon(linkTarget, areaId);
      setToastMessage(t.map.linkedToArea.replace("{area}", areaLabel));
      setLinkTarget(null);
    },
    [linkTarget, onLinkPolygon, t.map.linkedToArea],
  );

  const handleUnlinkConfirm = useCallback(() => {
    if (!unlinkTarget) return;
    onUnlinkPolygon(unlinkTarget.polygonId, unlinkTarget.areaId);
    setUnlinkTarget(null);
  }, [unlinkTarget, onUnlinkPolygon]);

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
          const isActive = poly.active !== false;
          const isLocked = poly.locked === true;
          const itemClasses = [
            "polygon-list-item",
            isSelected && "polygon-list-item-selected",
            !isActive && "polygon-list-item-inactive",
          ]
            .filter(Boolean)
            .join(" ");

          return (
            <div
              key={polyId}
              className={itemClasses}
              onClick={() => onPolygonClick(poly.id)}
            >
              <span className="polygon-list-item-label">
                {areaInfo ? areaInfo.areaLabel : t.map.noArea}
              </span>
              {areaInfo ? (
                <button
                  className="polygon-list-toggle-btn polygon-list-unlink-btn"
                  title={t.map.unlinkFromArea}
                  aria-label={t.map.unlinkFromArea}
                  onClick={(e) => {
                    e.stopPropagation();
                    setUnlinkTarget({
                      polygonId: poly.id,
                      areaId: areaInfo.areaId,
                      areaLabel: areaInfo.areaLabel,
                    });
                  }}
                >
                  {"\u2702"}
                </button>
              ) : (
                <button
                  className="polygon-list-toggle-btn polygon-list-link-btn"
                  title={t.map.linkToArea}
                  aria-label={t.map.linkToArea}
                  onClick={(e) => {
                    e.stopPropagation();
                    setLinkTarget(poly.id);
                  }}
                >
                  {"\uD83D\uDD17"}
                </button>
              )}
              <button
                className="polygon-list-toggle-btn"
                title={isActive ? t.map.hidePolygon : t.map.showPolygon}
                aria-label={isActive ? t.map.hidePolygon : t.map.showPolygon}
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleActive(poly.id, !isActive);
                }}
              >
                {isActive ? "\uD83D\uDC41" : "\u2014"}
              </button>
              <button
                className="polygon-list-toggle-btn"
                title={isLocked ? t.map.unlockPolygon : t.map.lockPolygon}
                aria-label={isLocked ? t.map.unlockPolygon : t.map.lockPolygon}
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleLocked(poly.id, !isLocked);
                }}
              >
                {isLocked ? "\uD83D\uDD12" : "\uD83D\uDD13"}
              </button>
              <button
                className="polygon-list-delete-btn"
                title={t.map.deletePolygon}
                aria-label={t.map.deletePolygon}
                disabled={isDrawing || isLocked}
                onClick={(e) => {
                  e.stopPropagation();
                  openDialog(poly);
                }}
              >
                {"\uD83D\uDDD1"}
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

      <AreaPickerDialog
        open={linkTarget !== null}
        tree={tree}
        linkedAreaIds={linkedAreaIds}
        onSelect={handleAreaSelect}
        onClose={() => setLinkTarget(null)}
      />

      {unlinkTarget && (
        <div className="modal-overlay" onClick={() => setUnlinkTarget(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <p className="polygon-delete-dialog-message">
              {t.map.confirmUnlink.replace("{area}", unlinkTarget.areaLabel)}
            </p>
            <div className="modal-actions">
              <button
                className="modal-btn"
                onClick={() => setUnlinkTarget(null)}
              >
                {t.common.cancel}
              </button>
              <button
                className="modal-btn modal-btn-danger"
                onClick={handleUnlinkConfirm}
              >
                {t.common.confirm}
              </button>
            </div>
          </div>
        </div>
      )}

      {toastMessage && <div className="toast">{toastMessage}</div>}
    </div>
  );
}
