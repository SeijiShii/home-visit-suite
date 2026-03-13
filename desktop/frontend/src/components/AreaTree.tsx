import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { useI18n } from "../contexts/I18nContext";
import { useCommandHistory } from "../hooks/useCommandHistory";
import { CommandExecutor } from "../services/command-executor";
import type {
  RegionService,
  RegionBindingAPI,
  AreaTreeNode,
} from "../services/region-service";

interface AreaTreeProps {
  service: RegionService;
  api: RegionBindingAPI;
}

export function AreaTree({ service, api }: AreaTreeProps) {
  const { t } = useI18n();
  const m = t.areaTree;
  const [tree, setTree] = useState<AreaTreeNode[]>([]);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [menuOpen, setMenuOpen] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [canSubmit, setCanSubmit] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<{
    type: "region" | "parentArea" | "area";
    id: string;
  } | null>(null);
  const [renameTarget, setRenameTarget] = useState<{
    id: string;
    name: string;
  } | null>(null);
  const [dragRegionId, setDragRegionId] = useState<string | null>(null);
  const [dragOverRegionId, setDragOverRegionId] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const symbolRef = useRef<HTMLInputElement>(null);
  const renameRef = useRef<HTMLInputElement>(null);

  const { snapshot, history } = useCommandHistory();
  const executor = useMemo(() => new CommandExecutor(api), [api]);

  const reload = useCallback(async () => {
    try {
      const data = await service.loadTree();
      setTree(data);
    } catch (e) {
      console.error("loadTree failed:", e);
    }
  }, [service]);

  useEffect(() => {
    reload();
  }, [reload]);

  const toggle = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  useEffect(() => {
    if (!menuOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [menuOpen]);

  const updateCanSubmit = () => {
    const name = nameRef.current?.value.trim() ?? "";
    const symbol = symbolRef.current?.value.trim() ?? "";
    setCanSubmit(name !== "" && symbol !== "");
  };

  const handleAddRegion = async () => {
    const name = nameRef.current?.value.trim() ?? "";
    const symbol = symbolRef.current?.value.trim() ?? "";
    if (!name || !symbol) return;
    try {
      await service.addRegion(name, symbol);
      setModalOpen(false);
      await reload();
    } catch (e) {
      console.error("addRegion failed:", e);
    }
  };

  const handleAddParentArea = async (regionId: string) => {
    try {
      await service.addParentArea(regionId, m.defaultParentAreaName);
      setExpanded((prev) => new Set(prev).add(regionId));
      await reload();
    } catch (e) {
      console.error("addParentArea failed:", e);
    }
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

  const handleDeleteClick = (
    type: "region" | "parentArea" | "area",
    id: string,
  ) => {
    setDeleteConfirm({ type, id });
  };

  const handleDragStart = (regionId: string) => {
    setDragRegionId(regionId);
  };

  const handleDragOver = (e: React.DragEvent, targetId: string) => {
    e.preventDefault();
    if (dragRegionId && dragRegionId !== targetId) {
      setDragOverRegionId(targetId);
    }
  };

  const handleDragLeave = () => {
    setDragOverRegionId(null);
  };

  const handleDrop = async (targetRegionId: string) => {
    setDragOverRegionId(null);
    if (!dragRegionId || dragRegionId === targetRegionId) {
      setDragRegionId(null);
      return;
    }
    const ids = tree.map((r) => r.id);
    const fromIndex = ids.indexOf(dragRegionId);
    if (fromIndex === -1) {
      setDragRegionId(null);
      return;
    }
    ids.splice(fromIndex, 1);
    if (targetRegionId === "__end__") {
      ids.push(dragRegionId);
    } else {
      const toIndex = ids.indexOf(targetRegionId);
      if (toIndex === -1) {
        setDragRegionId(null);
        return;
      }
      ids.splice(toIndex, 0, dragRegionId);
    }
    setDragRegionId(null);
    try {
      await service.reorderRegions(ids);
      await reload();
    } catch (e) {
      console.error("reorder failed:", e);
    }
  };

  const handleDragEnd = () => {
    setDragRegionId(null);
    setDragOverRegionId(null);
  };

  const handleDeleteConfirm = async () => {
    if (!deleteConfirm) return;
    const { type, id } = deleteConfirm;
    setDeleteConfirm(null);
    try {
      let cmd;
      if (type === "region") cmd = await service.deleteRegion(id);
      else if (type === "parentArea") cmd = await service.deleteParentArea(id);
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

  const handleModalClose = () => {
    setModalOpen(false);
  };

  return (
    <div className="area-tree">
      <div className="area-tree-header">
        <span className="area-tree-title">{m.title}</span>
        <div className="area-tree-menu-wrapper" ref={menuRef}>
          <button
            className="area-tree-menu-btn"
            onClick={() => setMenuOpen((v) => !v)}
          >
            ⋯
          </button>
          {menuOpen && (
            <div className="area-tree-dropdown">
              <button
                className="area-tree-dropdown-item"
                onClick={() => {
                  setMenuOpen(false);
                  setModalOpen(true);
                }}
              >
                {m.addRegion}
              </button>
            </div>
          )}
        </div>
      </div>
      <div className="area-tree-body">
        {tree.map((region) => (
          <div
            key={region.id}
            className={`tree-node${dragOverRegionId === region.id ? " tree-drag-over" : ""}`}
            draggable
            onDragStart={() => handleDragStart(region.id)}
            onDragOver={(e) => handleDragOver(e, region.id)}
            onDragLeave={handleDragLeave}
            onDrop={() => handleDrop(region.id)}
            onDragEnd={handleDragEnd}
          >
            <div className="tree-row tree-row-region">
              <button className="tree-toggle" onClick={() => toggle(region.id)}>
                {expanded.has(region.id) ? "▼" : "▶"}
              </button>
              <span className="tree-label">
                {region.symbol} ({region.name})
              </span>
              <span className="tree-actions">
                <button
                  className="tree-action-btn"
                  title={m.addChild}
                  onClick={() => handleAddParentArea(region.id)}
                >
                  ⊕
                </button>
                <button
                  className="tree-action-btn tree-action-delete"
                  title={m.remove}
                  onClick={() => handleDeleteClick("region", region.id)}
                >
                  🗑
                </button>
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
                      {service.isLastParentArea(region, ap.id) && (
                        <button
                          className="tree-action-btn tree-action-delete"
                          title={m.remove}
                          onClick={() => handleDeleteClick("parentArea", ap.id)}
                        >
                          🗑
                        </button>
                      )}
                    </span>
                  </div>
                  {expanded.has(ap.id) &&
                    ap.areas.map((area) => (
                      <div key={area.id} className="tree-node tree-indent-2">
                        <div className="tree-row tree-row-area">
                          <span className="tree-leaf">•</span>
                          <span className="tree-label">{area.number}</span>
                          <span className="tree-actions">
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
                    ))}
                </div>
              ))}
          </div>
        ))}
        {dragRegionId && (
          <div
            className={`tree-drop-end${dragOverRegionId === "__end__" ? " tree-drag-over" : ""}`}
            onDragOver={(e) => handleDragOver(e, "__end__")}
            onDragLeave={handleDragLeave}
            onDrop={() => handleDrop("__end__")}
          />
        )}
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

      {modalOpen && (
        <div className="modal-overlay" onClick={handleModalClose}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3 className="modal-title">{m.addRegion}</h3>
            <div className="modal-field">
              <label className="modal-label">{m.regionName}</label>
              <input
                ref={nameRef}
                className="modal-input"
                defaultValue=""
                onInput={updateCanSubmit}
                autoFocus
              />
            </div>
            <div className="modal-field">
              <label className="modal-label">{m.regionSymbol}</label>
              <input
                ref={symbolRef}
                className="modal-input"
                defaultValue=""
                onInput={updateCanSubmit}
                placeholder="NRT"
              />
            </div>
            <div className="modal-actions">
              <button className="modal-btn" onClick={handleModalClose}>
                {t.common.cancel}
              </button>
              <button
                className="modal-btn modal-btn-primary"
                onClick={handleAddRegion}
                disabled={!canSubmit}
              >
                {m.add}
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
    </div>
  );
}
