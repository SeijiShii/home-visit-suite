import { useState, useRef, useEffect, useCallback } from "react";
import { useI18n } from "../contexts/I18nContext";
import type { RegionService, AreaTreeNode } from "../services/region-service";

interface AreaTreeProps {
  service: RegionService;
}

export function AreaTree({ service }: AreaTreeProps) {
  const { t } = useI18n();
  const m = t.areaTree;
  const [tree, setTree] = useState<AreaTreeNode[]>([]);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [menuOpen, setMenuOpen] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [canSubmit, setCanSubmit] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const symbolRef = useRef<HTMLInputElement>(null);

  const reload = useCallback(async () => {
    const data = await service.loadTree();
    setTree(data);
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
    await service.addRegion(name, symbol);
    setModalOpen(false);
    await reload();
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
          <div key={region.id} className="tree-node">
            <div className="tree-row tree-row-region">
              <button className="tree-toggle" onClick={() => toggle(region.id)}>
                {expanded.has(region.id) ? "▼" : "▶"}
              </button>
              <span className="tree-label">
                {region.symbol} ({region.name})
              </span>
              <span className="tree-actions">
                <button className="tree-action-btn" title={m.add}>
                  +
                </button>
                <button
                  className="tree-action-btn tree-action-delete"
                  title={m.remove}
                >
                  −
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
                      <button className="tree-action-btn" title={m.add}>
                        +
                      </button>
                      <button
                        className="tree-action-btn tree-action-delete"
                        title={m.remove}
                      >
                        −
                      </button>
                    </span>
                  </div>
                  {expanded.has(ap.id) &&
                    ap.areas.map((area) => (
                      <div key={area.id} className="tree-node tree-indent-2">
                        <div className="tree-row tree-row-area">
                          <span className="tree-leaf">•</span>
                          <span className="tree-label">{area.number}</span>
                          <span className="tree-actions">
                            <button
                              className="tree-action-btn tree-action-delete"
                              title={m.remove}
                            >
                              −
                            </button>
                          </span>
                        </div>
                      </div>
                    ))}
                </div>
              ))}
          </div>
        ))}
      </div>

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
    </div>
  );
}
