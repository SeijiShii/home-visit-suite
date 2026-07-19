import { useState, useRef, useCallback, useMemo, useEffect } from "react";
import { useI18n } from "../contexts/I18nContext";
import type { PolygonID, PolygonSnapshot } from "map-polygon-editor";
import type { PolygonAreaInfo } from "../services/polygon-service";
import type { AreaTreeNode } from "../services/region-service";
import { AreaPickerDialog } from "./AreaPickerDialog";

interface PolygonListProps {
  polygons: PolygonSnapshot[];
  /** ポリゴンID → 紐付く区域一覧（N:M。先頭が代表区域） */
  polygonAreaMap: Map<string, PolygonAreaInfo[]>;
  tree: AreaTreeNode[];
  selectedPolygonId: PolygonID | null;
  onPolygonClick: (id: PolygonID) => void;
  onDeletePolygon: (snapshot: PolygonSnapshot) => void;
  onToggleActive: (id: PolygonID, active: boolean) => void;
  onToggleLocked: (id: PolygonID, locked: boolean) => void;
  onLinkPolygon: (polygonId: PolygonID, areaId: string) => void;
  onUnlinkPolygon: (polygonId: PolygonID, areaId: string) => void;
  isDrawing: boolean;
  /** 描画開始ボタンの押下ハンドラ (未指定時はツールバー非表示) */
  onStartDrawing?: () => void;
  /** 不要要素 (orphan 頂点・辺) 削除ハンドラ */
  onPruneOrphans?: () => void;
  /** 編集モード中はツールバーのボタンを非活性にする */
  isEditing?: boolean;
  /** タブ表示中か（display:none 中はスクロールできないため、表示化時に選択行へスクロールし直す） */
  visible?: boolean;
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
  onStartDrawing,
  onPruneOrphans,
  isEditing = false,
  visible = true,
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
  // 複数区域が紐付くポリゴンの解除対象選択ダイアログ（wants 03）。
  // 列挙はダイアログを開いた時点のスナップショットで固定する（開いている間に
  // 他端末の受信で紐付けが増減すると行がずれ、意図しない区域を解除して
  // その解除が全端末へ伝播する事故になるため）。
  const [unlinkPicker, setUnlinkPicker] = useState<{
    polygonId: PolygonID;
    areas: PolygonAreaInfo[];
  } | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // いずれかのポリゴンに紐付け済みの区域ID（ピッカーのグレーアウト判定）
  const linkedAreaIds = useMemo(() => {
    const ids = new Set<string>();
    for (const infos of polygonAreaMap.values()) {
      for (const info of infos) ids.add(info.areaId);
    }
    return ids;
  }, [polygonAreaMap]);

  // リンク対象ポリゴン自身が既に紐付いている区域（重複紐付けを作らせない）
  const linkTargetAreaIds = useMemo(() => {
    if (!linkTarget) return new Set<string>();
    const infos = polygonAreaMap.get(linkTarget as string) ?? [];
    return new Set(infos.map((i) => i.areaId));
  }, [linkTarget, polygonAreaMap]);

  // トースト自動消去
  useEffect(() => {
    if (!toastMessage) return;
    const timer = setTimeout(() => setToastMessage(null), 3000);
    return () => clearTimeout(timer);
  }, [toastMessage]);

  // 選択行を一覧の可視範囲へスクロール
  const selectedItemRef = useRef<HTMLDivElement | null>(null);
  const attachSelectedItem = useCallback((node: HTMLDivElement | null) => {
    selectedItemRef.current = node;
    node?.scrollIntoView({ block: "nearest" });
  }, []);
  useEffect(() => {
    if (visible) {
      selectedItemRef.current?.scrollIntoView({ block: "nearest" });
    }
  }, [visible, selectedPolygonId]);

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
    // 確認ダイアログを開いている間に受信で紐付けが消えていたら何もしない
    // （解除は全端末へ伝播するため、現在の紐付きを対象確定時に再照合する）。
    const current = polygonAreaMap.get(unlinkTarget.polygonId as string) ?? [];
    if (current.some((i) => i.areaId === unlinkTarget.areaId)) {
      onUnlinkPolygon(unlinkTarget.polygonId, unlinkTarget.areaId);
    }
    setUnlinkTarget(null);
  }, [unlinkTarget, onUnlinkPolygon, polygonAreaMap]);

  if (polygons.length === 0) {
    return (
      <div className="polygon-list">
        {(onStartDrawing || onPruneOrphans) && (
          <div className="polygon-list-toolbar">
            {onStartDrawing && (
              <button
                type="button"
                className="polygon-list-tool-btn"
                onClick={onStartDrawing}
                disabled={isDrawing || isEditing}
                title={t.map.startDrawing}
                aria-label={t.map.startDrawing}
              >
                <span aria-hidden="true">✏️</span>
              </button>
            )}
            {onPruneOrphans && (
              <button
                type="button"
                className="polygon-list-tool-btn"
                onClick={onPruneOrphans}
                disabled={isDrawing || isEditing}
                title={t.map.pruneOrphans}
                aria-label={t.map.pruneOrphans}
              >
                <span aria-hidden="true">🧹</span>
              </button>
            )}
          </div>
        )}
        <div className="polygon-list-body">
          <p className="polygon-list-empty">{t.common.noData}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="polygon-list">
      {(onStartDrawing || onPruneOrphans) && (
        <div className="polygon-list-toolbar">
          {onStartDrawing && (
            <button
              type="button"
              className="polygon-list-tool-btn"
              onClick={onStartDrawing}
              disabled={isDrawing || isEditing}
              title={t.map.startDrawing}
              aria-label={t.map.startDrawing}
            >
              <span aria-hidden="true">✏️</span>
            </button>
          )}
          {onPruneOrphans && (
            <button
              type="button"
              className="polygon-list-tool-btn"
              onClick={onPruneOrphans}
              disabled={isDrawing || isEditing}
              title={t.map.pruneOrphans}
              aria-label={t.map.pruneOrphans}
            >
              <span aria-hidden="true">🧹</span>
            </button>
          )}
        </div>
      )}
      <div className="polygon-list-body">
        {polygons.map((poly) => {
          const polyId = poly.id as string;
          const areaInfos = polygonAreaMap.get(polyId) ?? [];
          // 0 件=区域なし / 1 件=区域ID+区域親番名 / 2 件以上=「複数の区域」
          // （個々の区域は鋏ボタンのダイアログで確認する。wants 03）
          const areaLabelText =
            areaInfos.length === 0
              ? t.map.noArea
              : areaInfos.length === 1
                ? areaInfos[0].areaLabel
                : t.map.multipleAreas;
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
              ref={isSelected ? attachSelectedItem : undefined}
              className={itemClasses}
              onClick={() => onPolygonClick(poly.id)}
            >
              <span className="polygon-list-item-label">{areaLabelText}</span>
              {/* \u7D10\u4ED8\u3051\u8FFD\u52A0\uFF08\u30D7\u30E9\u30B9\uFF09\u306F\u7D10\u4ED8\u3051\u306E\u6709\u7121\u306B\u304B\u304B\u308F\u3089\u305A\u5E38\u8A2D\u3002
                  1 \u30DD\u30EA\u30B4\u30F3\u3078\u8907\u6570\u533A\u57DF\u3092\u7D10\u4ED8\u3051\u3089\u308C\u308B\u305F\u3081\uFF08wants 03\uFF09\u3002 */}
              <button
                className="polygon-list-toggle-btn polygon-list-link-btn"
                title={t.map.linkToArea}
                aria-label={t.map.linkToArea}
                onClick={(e) => {
                  e.stopPropagation();
                  setLinkTarget(poly.id);
                }}
              >
                {"\u2795"}
              </button>
              {areaInfos.length > 0 && (
                <button
                  className="polygon-list-toggle-btn polygon-list-unlink-btn"
                  title={t.map.unlinkFromArea}
                  aria-label={t.map.unlinkFromArea}
                  onClick={(e) => {
                    e.stopPropagation();
                    // \u8907\u6570\u7D10\u4ED8\u3051\u6642\u306F\u89E3\u9664\u5BFE\u8C61\u3092\u9078\u3070\u305B\u308B
                    if (areaInfos.length > 1) {
                      setUnlinkPicker({
                        polygonId: poly.id,
                        areas: [...areaInfos],
                      });
                      return;
                    }
                    setUnlinkTarget({
                      polygonId: poly.id,
                      areaId: areaInfos[0].areaId,
                      areaLabel: areaInfos[0].areaLabel,
                    });
                  }}
                >
                  {"\u2702"}
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
        boundAreaIds={linkTargetAreaIds}
        onSelect={handleAreaSelect}
        onClose={() => setLinkTarget(null)}
      />

      {/* 複数区域が紐付くポリゴンの解除対象選択（wants 03） */}
      {unlinkPicker && (
        <div className="modal-overlay" onClick={() => setUnlinkPicker(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3 className="modal-title">{t.map.selectAreaToUnlink}</h3>
            <ul className="polygon-unlink-picker-list">
              {unlinkPicker.areas.map((info) => (
                <li key={info.areaId} className="polygon-unlink-picker-item">
                  <span className="polygon-unlink-picker-label">
                    {info.areaLabel}
                  </span>
                  <button
                    type="button"
                    className="polygon-list-toggle-btn polygon-list-unlink-btn"
                    title={t.map.unlinkFromArea}
                    aria-label={t.map.unlinkFromArea}
                    onClick={() => {
                      setUnlinkPicker(null);
                      setUnlinkTarget({
                        polygonId: unlinkPicker.polygonId,
                        areaId: info.areaId,
                        areaLabel: info.areaLabel,
                      });
                    }}
                  >
                    {"✂"}
                  </button>
                </li>
              ))}
            </ul>
            <div className="modal-actions">
              <button
                className="modal-btn"
                onClick={() => setUnlinkPicker(null)}
              >
                {t.common.cancel}
              </button>
            </div>
          </div>
        </div>
      )}

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
