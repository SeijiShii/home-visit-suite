import {
  useState,
  useRef,
  useEffect,
  useCallback,
  useMemo,
  forwardRef,
  useImperativeHandle,
} from "react";
import { useI18n } from "../contexts/I18nContext";
import { useCommandHistory } from "../hooks/useCommandHistory";
import { CommandExecutor } from "../services/command-executor";
import type {
  RegionService,
  RegionBindingAPI,
  AreaTreeNode,
} from "../services/region-service";
import { findAreaPathForPolygon } from "../lib/area-tree-path";

export interface AreaTreeHandle {
  reload(): Promise<void>;
}

interface AreaTreeProps {
  service: RegionService;
  api: RegionBindingAPI;
  onUnlinkPolygon?: (areaId: string) => void;
  onSelectPolygon?: (polygonId: string) => void;
  selectedPolygonId?: string | null;
  onTreeChanged?: (tree: AreaTreeNode[]) => void;
  /** 区域詳細編集モードへ遷移する際のハンドラ。指定時は行 dblclick / 三点メニューに表示。 */
  onOpenAreaDetail?: (areaId: string) => void;
  /** タブ表示中か（display:none 中はスクロールできないため、表示化時に選択行へスクロールし直す） */
  visible?: boolean;
}

export const AreaTree = forwardRef<AreaTreeHandle, AreaTreeProps>(
  function AreaTree(
    {
      service,
      api,
      onUnlinkPolygon,
      onSelectPolygon,
      selectedPolygonId,
      onTreeChanged,
      onOpenAreaDetail,
      visible = true,
    },
    ref,
  ) {
    const { t } = useI18n();
    const m = t.areaTree;
    const [tree, setTree] = useState<AreaTreeNode[]>([]);
    const [expanded, setExpanded] = useState<Set<string>>(new Set());
    const [deleteConfirm, setDeleteConfirm] = useState<{
      type: "parentArea" | "area";
      id: string;
    } | null>(null);
    const [renameTarget, setRenameTarget] = useState<{
      id: string;
      name: string;
    } | null>(null);
    const renameRef = useRef<HTMLInputElement>(null);
    const [menuTarget, setMenuTarget] = useState<string | null>(null);
    const [unlinkConfirm, setUnlinkConfirm] = useState<{
      areaId: string;
      areaLabel: string;
      /** 紐付け中ポリゴン数（複数=飛地あり。確認文言の出し分けに使う） */
      polygonCount: number;
    } | null>(null);

    const { snapshot, history } = useCommandHistory();
    const executor = useMemo(() => new CommandExecutor(api), [api]);

    useImperativeHandle(ref, () => ({ reload }));

    const reload = useCallback(async () => {
      try {
        const data = await service.loadTree();
        setTree(data);
        onTreeChanged?.(data);
      } catch (e) {
        console.error("loadTree failed:", e);
      }
    }, [service, onTreeChanged]);

    useEffect(() => {
      reload();
    }, [reload]);

    // 選択ポリゴンの区域行が畳まれていたら祖先（領域・区域親番）を展開する。
    // 展開は選択ごとに一度だけ（ツリー再ロードでユーザーが畳み直したノードを再展開しない）
    const expandedForPolygonRef = useRef<string | null>(null);
    useEffect(() => {
      if (selectedPolygonId == null) {
        expandedForPolygonRef.current = null;
        return;
      }
      if (expandedForPolygonRef.current === selectedPolygonId) return;
      const path = findAreaPathForPolygon(tree, selectedPolygonId);
      if (!path) return;
      expandedForPolygonRef.current = selectedPolygonId;
      setExpanded((prev) => {
        if (prev.has(path.regionId) && prev.has(path.parentAreaId)) {
          return prev;
        }
        const next = new Set(prev);
        next.add(path.regionId);
        next.add(path.parentAreaId);
        return next;
      });
    }, [selectedPolygonId, tree]);

    // 選択行を一覧の可視範囲へスクロール（展開直後のマウント時は ref callback 側が担う）
    const selectedRowRef = useRef<HTMLDivElement | null>(null);
    const attachSelectedRow = useCallback((node: HTMLDivElement | null) => {
      selectedRowRef.current = node;
      node?.scrollIntoView({ block: "nearest" });
    }, []);
    useEffect(() => {
      if (visible) {
        selectedRowRef.current?.scrollIntoView({ block: "nearest" });
      }
    }, [visible, selectedPolygonId]);

    const toggle = (id: string) => {
      setExpanded((prev) => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      });
    };

    const handleAddArea = async (parentAreaId: string) => {
      try {
        await service.addArea(parentAreaId);
        setExpanded((prev) => new Set(prev).add(parentAreaId));
        await reload();
      } catch (e) {
        console.error("addArea failed:", e);
      }
    };

    const handleRenameConfirm = async () => {
      if (!renameTarget) return;
      const newName = renameRef.current?.value.trim() ?? "";
      if (!newName || newName === renameTarget.name) {
        setRenameTarget(null);
        return;
      }
      try {
        await service.renameParentArea(renameTarget.id, newName);
        setRenameTarget(null);
        await reload();
      } catch (err) {
        console.error("renameParentArea failed:", err);
      }
    };

    const handleDeleteClick = (type: "parentArea" | "area", id: string) => {
      setDeleteConfirm({ type, id });
    };

    const handleDeleteConfirm = async () => {
      if (!deleteConfirm) return;
      const { type, id } = deleteConfirm;
      setDeleteConfirm(null);
      try {
        let cmd;
        if (type === "parentArea") cmd = await service.deleteParentArea(id);
        else cmd = await service.deleteArea(id);
        history.push(cmd);
        await reload();
      } catch (e) {
        console.error("delete failed:", e);
      }
    };

    const handleUndo = async () => {
      const cmd = history.undo();
      if (!cmd) return;
      try {
        await executor.undo(cmd);
        await reload();
      } catch (e) {
        console.error("undo failed:", e);
        history.push(cmd);
      }
    };

    const handleRedo = async () => {
      const cmd = history.redo();
      if (!cmd) return;
      try {
        await executor.redo(cmd);
        await reload();
      } catch (e) {
        console.error("redo failed:", e);
      }
    };

    return (
      <div className="area-tree">
        <div className="area-tree-body">
          {tree.map((region) => (
            <div key={region.id} className="tree-node">
              <div className="tree-row tree-row-region">
                <button
                  className="tree-toggle"
                  onClick={() => toggle(region.id)}
                >
                  {expanded.has(region.id) ? "▼" : "▶"}
                </button>
                <span className="tree-label">
                  {region.symbol} ({region.name})
                </span>
              </div>
              {expanded.has(region.id) &&
                region.parentAreas.map((ap) => (
                  <div key={ap.id} className="tree-node tree-indent-1">
                    <div className="tree-row tree-row-parent">
                      <button
                        className="tree-toggle"
                        onClick={() => toggle(ap.id)}
                      >
                        {expanded.has(ap.id) ? "▼" : "▶"}
                      </button>
                      <span className="tree-label">
                        {ap.number} {ap.name}
                      </span>
                      <span className="tree-actions">
                        <button
                          className="tree-action-btn"
                          title={t.common.edit}
                          onClick={() =>
                            setRenameTarget({ id: ap.id, name: ap.name })
                          }
                        >
                          ✏
                        </button>
                        <button
                          className="tree-action-btn"
                          title={m.addChild}
                          onClick={() => handleAddArea(ap.id)}
                        >
                          ⊕
                        </button>
                      </span>
                    </div>
                    {expanded.has(ap.id) &&
                      ap.areas.map((area) => {
                        const polygonIds = area.polygonIds ?? [];
                        const hasPolygon = polygonIds.length > 0;
                        const isSelected =
                          selectedPolygonId != null &&
                          polygonIds.includes(selectedPolygonId);
                        return (
                          <div
                            key={area.id}
                            className="tree-node tree-indent-2"
                          >
                            <div
                              ref={isSelected ? attachSelectedRow : undefined}
                              className={`tree-row tree-row-area${
                                isSelected ? " tree-row-selected" : ""
                              }`}
                              onClick={() => {
                                // 複数飛地は先頭ポリゴンへフォーカスする
                                if (hasPolygon && onSelectPolygon) {
                                  onSelectPolygon(polygonIds[0]);
                                }
                              }}
                              onDoubleClick={() => {
                                if (hasPolygon && onOpenAreaDetail) {
                                  onOpenAreaDetail(area.id);
                                }
                              }}
                              style={
                                hasPolygon && onSelectPolygon
                                  ? { cursor: "pointer" }
                                  : undefined
                              }
                            >
                              <span className="tree-leaf">•</span>
                              <span className="tree-label">{area.number}</span>
                              <span className="tree-actions">
                                {hasPolygon && (
                                  <>
                                    <span
                                      className="tree-action-btn tree-action-polygon"
                                      title={t.map.tabPolygons}
                                    >
                                      ⬡
                                    </span>
                                    {(onUnlinkPolygon || onOpenAreaDetail) && (
                                      <div className="tree-action-menu-wrapper">
                                        <button
                                          className="tree-action-btn"
                                          onClick={() =>
                                            setMenuTarget(
                                              menuTarget === area.id
                                                ? null
                                                : area.id,
                                            )
                                          }
                                        >
                                          ⋯
                                        </button>
                                        {menuTarget === area.id && (
                                          <div className="tree-action-dropdown">
                                            {onOpenAreaDetail && (
                                              <button
                                                className="tree-action-dropdown-item"
                                                onClick={() => {
                                                  setMenuTarget(null);
                                                  onOpenAreaDetail(area.id);
                                                }}
                                              >
                                                {t.visitRecord.pageTitle}
                                              </button>
                                            )}
                                            {onUnlinkPolygon && (
                                              <button
                                                className="tree-action-dropdown-item"
                                                onClick={() => {
                                                  setMenuTarget(null);
                                                  setUnlinkConfirm({
                                                    areaId: area.id,
                                                    areaLabel: area.id,
                                                    polygonCount:
                                                      polygonIds.length,
                                                  });
                                                }}
                                              >
                                                {t.map.unlinkPolygon}
                                              </button>
                                            )}
                                          </div>
                                        )}
                                      </div>
                                    )}
                                  </>
                                )}
                                {service.isLastArea(ap, area.id) && (
                                  <button
                                    className="tree-action-btn tree-action-delete"
                                    title={m.remove}
                                    onClick={() =>
                                      handleDeleteClick("area", area.id)
                                    }
                                  >
                                    🗑
                                  </button>
                                )}
                              </span>
                            </div>
                          </div>
                        );
                      })}
                  </div>
                ))}
            </div>
          ))}
        </div>

        {(snapshot.canUndo || snapshot.canRedo) && (
          <div className="undo-bar">
            {snapshot.canUndo && (
              <>
                <span>{m.deleted}</span>
                <button className="undo-btn" onClick={handleUndo}>
                  {m.undo}
                </button>
              </>
            )}
            {snapshot.canRedo && (
              <button className="undo-btn" onClick={handleRedo}>
                {m.redo}
              </button>
            )}
          </div>
        )}

        {deleteConfirm && (
          <div className="modal-overlay" onClick={() => setDeleteConfirm(null)}>
            <div className="modal" onClick={(e) => e.stopPropagation()}>
              <h3 className="modal-title">{m.confirmDelete}</h3>
              <div className="modal-actions">
                <button
                  className="modal-btn"
                  onClick={() => setDeleteConfirm(null)}
                >
                  {t.common.cancel}
                </button>
                <button
                  className="modal-btn modal-btn-danger"
                  onClick={handleDeleteConfirm}
                >
                  {m.remove}
                </button>
              </div>
            </div>
          </div>
        )}

        {renameTarget && (
          <div className="modal-overlay" onClick={() => setRenameTarget(null)}>
            <div className="modal" onClick={(e) => e.stopPropagation()}>
              <h3 className="modal-title">{t.common.edit}</h3>
              <div className="modal-field">
                <label className="modal-label">{m.areaParent}</label>
                <input
                  ref={renameRef}
                  className="modal-input"
                  defaultValue={renameTarget.name}
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleRenameConfirm();
                    if (e.key === "Escape") setRenameTarget(null);
                  }}
                />
              </div>
              <div className="modal-actions">
                <button
                  className="modal-btn"
                  onClick={() => setRenameTarget(null)}
                >
                  {t.common.cancel}
                </button>
                <button
                  className="modal-btn modal-btn-primary"
                  onClick={handleRenameConfirm}
                >
                  {t.common.save}
                </button>
              </div>
            </div>
          </div>
        )}

        {unlinkConfirm && (
          <div className="modal-overlay" onClick={() => setUnlinkConfirm(null)}>
            <div className="modal" onClick={(e) => e.stopPropagation()}>
              <p className="polygon-delete-dialog-message">
                {/* 複数飛地の一括解除は件数を明示する（docs/wants/03） */}
                {unlinkConfirm.polygonCount > 1
                  ? t.map.confirmUnlinkAll
                      .replace("{area}", unlinkConfirm.areaLabel)
                      .replace("{count}", String(unlinkConfirm.polygonCount))
                  : t.map.confirmUnlink.replace(
                      "{area}",
                      unlinkConfirm.areaLabel,
                    )}
              </p>
              <div className="modal-actions">
                <button
                  className="modal-btn"
                  onClick={() => setUnlinkConfirm(null)}
                >
                  {t.common.cancel}
                </button>
                <button
                  className="modal-btn modal-btn-danger"
                  onClick={async () => {
                    const { areaId } = unlinkConfirm;
                    setUnlinkConfirm(null);
                    onUnlinkPolygon?.(areaId);
                  }}
                >
                  {t.map.unlinkFromArea}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  },
);
