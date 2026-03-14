import { useState, useRef, useCallback, useMemo, useEffect } from "react";
import { useI18n } from "../contexts/I18nContext";
import { RegionService } from "../services/region-service";
import * as RegionBinding from "../../wailsjs/go/binding/RegionBinding";
import type { AreaTreeNode } from "../services/region-service";

type ModalState =
  | { type: "none" }
  | { type: "add" }
  | { type: "edit"; region: AreaTreeNode }
  | { type: "delete"; region: AreaTreeNode };

export function RegionManagementPage() {
  const { t } = useI18n();
  const m = t.regionManagement;
  const service = useMemo(() => new RegionService(RegionBinding), []);

  const [regions, setRegions] = useState<AreaTreeNode[]>([]);
  const [modal, setModal] = useState<ModalState>({ type: "none" });
  const [canSubmit, setCanSubmit] = useState(false);

  // Add modal refs
  const addNameRef = useRef<HTMLInputElement>(null);
  const addSymbolRef = useRef<HTMLInputElement>(null);

  // Edit modal refs
  const editNameRef = useRef<HTMLInputElement>(null);
  const editSymbolRef = useRef<HTMLInputElement>(null);

  // Delete modal refs
  const deleteNameRef = useRef<HTMLInputElement>(null);
  const deleteSymbolRef = useRef<HTMLInputElement>(null);

  const reload = useCallback(async () => {
    try {
      const data = await service.loadTree();
      setRegions(data);
    } catch (e) {
      console.error("loadTree failed:", e);
    }
  }, [service]);

  useEffect(() => {
    reload();
  }, [reload]);

  const closeModal = () => {
    setModal({ type: "none" });
    setCanSubmit(false);
  };

  // --- Add ---
  const updateAddCanSubmit = () => {
    const name = addNameRef.current?.value.trim() ?? "";
    const symbol = addSymbolRef.current?.value.trim() ?? "";
    setCanSubmit(name !== "" && symbol !== "");
  };

  const handleAdd = async () => {
    const name = addNameRef.current?.value.trim() ?? "";
    const symbol = addSymbolRef.current?.value.trim() ?? "";
    if (!name || !symbol) return;
    try {
      await service.addRegion(name, symbol);
      closeModal();
      await reload();
    } catch (e) {
      console.error("addRegion failed:", e);
    }
  };

  // --- Edit ---
  const updateEditCanSubmit = () => {
    if (modal.type !== "edit") return;
    const name = editNameRef.current?.value.trim() ?? "";
    const symbol = editSymbolRef.current?.value.trim() ?? "";
    const changed = name !== modal.region.name || symbol !== modal.region.symbol;
    setCanSubmit(name !== "" && symbol !== "" && changed);
  };

  const handleEdit = async () => {
    if (modal.type !== "edit") return;
    const name = editNameRef.current?.value.trim() ?? "";
    const symbol = editSymbolRef.current?.value.trim() ?? "";
    if (!name || !symbol) return;
    try {
      await service.updateRegion(modal.region.id, name, symbol);
      closeModal();
      await reload();
    } catch (e) {
      console.error("updateRegion failed:", e);
    }
  };

  // --- Delete ---
  const updateDeleteCanSubmit = () => {
    if (modal.type !== "delete") return;
    const name = deleteNameRef.current?.value.trim() ?? "";
    const symbol = deleteSymbolRef.current?.value.trim() ?? "";
    setCanSubmit(name === modal.region.name && symbol === modal.region.symbol);
  };

  const handleDelete = async () => {
    if (modal.type !== "delete") return;
    try {
      await service.deleteRegion(modal.region.id);
      closeModal();
      await reload();
    } catch (e) {
      console.error("deleteRegion failed:", e);
    }
  };

  // --- Move ---
  const handleMove = async (id: string, direction: "up" | "down") => {
    try {
      await service.moveRegion(id, direction);
      await reload();
    } catch (e) {
      console.error("moveRegion failed:", e);
    }
  };

  return (
    <div className="region-management">
      <div className="region-management-header">
        <h2 className="region-management-title">{m.title}</h2>
        <button
          className="region-management-add-btn"
          onClick={() => setModal({ type: "add" })}
        >
          {m.addRegion}
        </button>
      </div>

      <div className="region-management-list">
        {regions.length === 0 && (
          <div className="region-management-empty">{t.common.noData}</div>
        )}
        {regions.map((region, index) => (
          <div key={region.id} className="region-management-item">
            <div className="region-management-info">
              <span className="region-management-symbol">{region.symbol}</span>
              <span className="region-management-name">{region.name}</span>
              <span className="region-management-count">
                {region.parentAreas.length} {m.parentAreaCount}
              </span>
            </div>
            <div className="region-management-actions">
              <button
                className="region-management-action-btn"
                title={m.moveUp}
                disabled={index === 0}
                onClick={() => handleMove(region.id, "up")}
              >
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="18 15 12 9 6 15" />
                </svg>
              </button>
              <button
                className="region-management-action-btn"
                title={m.moveDown}
                disabled={index === regions.length - 1}
                onClick={() => handleMove(region.id, "down")}
              >
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </button>
              <button
                className="region-management-action-btn"
                title={t.common.edit}
                onClick={() => setModal({ type: "edit", region })}
              >
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                  <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                </svg>
              </button>
              <button
                className="region-management-action-btn region-management-action-delete"
                title={m.deleteRegion}
                onClick={() => setModal({ type: "delete", region })}
              >
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="3 6 5 6 21 6" />
                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                </svg>
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Add Region Modal */}
      {modal.type === "add" && (
        <div className="modal-overlay" onClick={closeModal}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3 className="modal-title">{m.addRegion}</h3>
            <div className="modal-field">
              <label className="modal-label">{m.regionName}</label>
              <input
                ref={addNameRef}
                className="modal-input"
                defaultValue=""
                onInput={updateAddCanSubmit}
                autoFocus
              />
            </div>
            <div className="modal-field">
              <label className="modal-label">{m.regionSymbol}</label>
              <input
                ref={addSymbolRef}
                className="modal-input"
                defaultValue=""
                onInput={updateAddCanSubmit}
                placeholder="NRT"
              />
            </div>
            <div className="modal-actions">
              <button className="modal-btn" onClick={closeModal}>
                {t.common.cancel}
              </button>
              <button
                className="modal-btn modal-btn-primary"
                onClick={handleAdd}
                disabled={!canSubmit}
              >
                {t.areaTree.add}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Region Modal */}
      {modal.type === "edit" && (
        <div className="modal-overlay" onClick={closeModal}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3 className="modal-title">{m.editRegion}</h3>
            <div className="modal-field">
              <label className="modal-label">{m.regionName}</label>
              <input
                ref={editNameRef}
                className="modal-input"
                defaultValue={modal.region.name}
                onInput={updateEditCanSubmit}
                autoFocus
              />
            </div>
            <div className="modal-field">
              <label className="modal-label">{m.regionSymbol}</label>
              <input
                ref={editSymbolRef}
                className="modal-input"
                defaultValue={modal.region.symbol}
                onInput={updateEditCanSubmit}
              />
            </div>
            {editSymbolRef.current &&
              editSymbolRef.current.value.trim() !== modal.region.symbol &&
              editSymbolRef.current.value.trim() !== "" && (
                <div className="region-management-warning">
                  {m.symbolChangeWarning}
                </div>
              )}
            <div className="modal-actions">
              <button className="modal-btn" onClick={closeModal}>
                {t.common.cancel}
              </button>
              <button
                className="modal-btn modal-btn-primary"
                onClick={handleEdit}
                disabled={!canSubmit}
              >
                {t.common.save}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Region Confirmation */}
      {modal.type === "delete" && (
        <div className="modal-overlay" onClick={closeModal}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3 className="modal-title">{m.confirmDeleteTitle}</h3>
            <p className="region-delete-message">{m.confirmDeleteMessage}</p>
            <div className="region-delete-target">
              <span className="region-delete-target-symbol">
                {modal.region.symbol}
              </span>
              <span className="region-delete-target-name">
                {modal.region.name}
              </span>
            </div>
            <div className="modal-field">
              <label className="modal-label">{m.enterNameToConfirm}</label>
              <input
                ref={deleteNameRef}
                className="modal-input"
                defaultValue=""
                onInput={updateDeleteCanSubmit}
                autoFocus
              />
            </div>
            <div className="modal-field">
              <label className="modal-label">{m.enterSymbolToConfirm}</label>
              <input
                ref={deleteSymbolRef}
                className="modal-input"
                defaultValue=""
                onInput={updateDeleteCanSubmit}
              />
            </div>
            <div className="modal-actions">
              <button className="modal-btn" onClick={closeModal}>
                {t.common.cancel}
              </button>
              <button
                className="modal-btn modal-btn-danger"
                onClick={handleDelete}
                disabled={!canSubmit}
              >
                {m.deleteRegion}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
