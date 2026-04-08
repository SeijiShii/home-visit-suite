import { useEffect, useMemo, useState, useCallback } from "react";
import { useI18n } from "../contexts/I18nContext";
import { ScheduleService } from "../services/schedule-service";
import { RegionService, type AreaTreeNode } from "../services/region-service";
import * as ScheduleBinding from "../../wailsjs/go/binding/ScheduleBinding";
import * as RegionBinding from "../../wailsjs/go/binding/RegionBinding";
import * as UserBinding from "../../wailsjs/go/binding/UserBinding";
import { models } from "../../wailsjs/go/models";

type View = { kind: "list" } | { kind: "detail"; periodId: string };
type Tx = ReturnType<typeof useI18n>["t"]["coverage"]["schedule"];

function isoDate(d: any): string {
  if (!d) return "";
  try {
    return new Date(d).toISOString().slice(0, 10);
  } catch {
    return "";
  }
}

function parseError(err: unknown, tx: Tx): string {
  const m = String((err as Error)?.message ?? err);
  if (m.includes("overlap")) return tx.errorOverlap;
  if (m.includes("already assigned to scope")) return tx.errorExclusive;
  if (m.includes("admin role required")) return tx.errorPermission;
  return `${tx.errorGeneric}: ${m}`;
}

export function CoveragePage() {
  const { t } = useI18n();
  const tx = t.coverage.schedule;
  const scheduleService = useMemo(
    () => new ScheduleService(ScheduleBinding),
    [],
  );
  const regionService = useMemo(() => new RegionService(RegionBinding), []);

  const [view, setView] = useState<View>({ kind: "list" });
  const [periods, setPeriods] = useState<models.SchedulePeriod[]>([]);
  const [error, setError] = useState<string>("");

  const reloadPeriods = useCallback(async () => {
    try {
      setPeriods(await scheduleService.listPeriods());
    } catch (e) {
      setError(parseError(e, tx));
    }
  }, [scheduleService, tx]);

  useEffect(() => {
    void reloadPeriods();
  }, [reloadPeriods]);

  return (
    <div className="coverage-page">
      <h1>{t.coverage.title}</h1>
      {error && <div className="coverage-error">{error}</div>}
      {view.kind === "list" ? (
        <PeriodListView
          periods={periods}
          service={scheduleService}
          tx={tx}
          onError={(e) => setError(parseError(e, tx))}
          onReload={reloadPeriods}
          onOpen={(id) => {
            setError("");
            setView({ kind: "detail", periodId: id });
          }}
        />
      ) : (
        <PeriodDetailView
          periodId={view.periodId}
          scheduleService={scheduleService}
          regionService={regionService}
          tx={tx}
          onError={(e) => setError(parseError(e, tx))}
          onBack={() => {
            setError("");
            setView({ kind: "list" });
            void reloadPeriods();
          }}
        />
      )}
    </div>
  );
}

// =============================================================================
// PeriodListView
// =============================================================================

function PeriodListView(props: {
  periods: models.SchedulePeriod[];
  service: ScheduleService;
  tx: Tx;
  onError: (e: unknown) => void;
  onReload: () => Promise<void>;
  onOpen: (id: string) => void;
}) {
  const { periods, service, tx, onError, onReload, onOpen } = props;
  const [editing, setEditing] = useState<models.SchedulePeriod | null>(null);
  const [creating, setCreating] = useState(false);

  const handleSave = async (sp: models.SchedulePeriod, isNew: boolean) => {
    try {
      if (isNew) await service.createPeriod(sp);
      else await service.updatePeriod(sp);
      setEditing(null);
      setCreating(false);
      await onReload();
    } catch (e) {
      onError(e);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await service.deletePeriod(id);
      await onReload();
    } catch (e) {
      onError(e);
    }
  };

  return (
    <section>
      <div className="coverage-toolbar">
        <button
          className="coverage-btn coverage-btn-primary"
          onClick={() => setCreating(true)}
        >
          {tx.newPeriod}
        </button>
      </div>
      {periods.length === 0 ? (
        <p className="coverage-empty">—</p>
      ) : (
        <table className="coverage-table">
          <thead>
            <tr>
              <th>{tx.periodName}</th>
              <th>{tx.startDate}</th>
              <th>{tx.endDate}</th>
              <th>{tx.approved}</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {periods.map((p) => (
              <tr key={p.id}>
                <td>
                  <a className="coverage-link" onClick={() => onOpen(p.id)}>
                    {p.name}
                  </a>
                </td>
                <td>{isoDate(p.startDate)}</td>
                <td>{isoDate(p.endDate)}</td>
                <td>
                  <span
                    className={`coverage-badge ${p.approved ? "coverage-badge-approved" : "coverage-badge-pending"}`}
                  >
                    {p.approved ? tx.approved : tx.notApproved}
                  </span>
                </td>
                <td>
                  <button
                    className="coverage-btn"
                    onClick={() => setEditing(p)}
                  >
                    {tx.edit}
                  </button>{" "}
                  <button
                    className="coverage-btn coverage-btn-danger"
                    onClick={() => handleDelete(p.id)}
                  >
                    {tx.delete}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {(creating || editing) && (
        <PeriodEditor
          initial={editing ?? undefined}
          tx={tx}
          onSave={(sp) => handleSave(sp, !editing)}
          onCancel={() => {
            setCreating(false);
            setEditing(null);
          }}
        />
      )}
    </section>
  );
}

function PeriodEditor(props: {
  initial?: models.SchedulePeriod;
  tx: Tx;
  onSave: (sp: models.SchedulePeriod) => void;
  onCancel: () => void;
}) {
  const { initial, tx, onSave, onCancel } = props;
  const [name, setName] = useState(initial?.name ?? "");
  const [start, setStart] = useState(isoDate(initial?.startDate));
  const [end, setEnd] = useState(isoDate(initial?.endDate));

  const dateOrderInvalid = !!start && !!end && start >= end;
  const canSave = !!name && !!start && !!end && !dateOrderInvalid;

  const handleSave = () => {
    if (!canSave) return;
    const sp = {
      id: initial?.id ?? `sp-${Date.now()}`,
      name,
      startDate: new Date(start).toISOString(),
      endDate: new Date(end).toISOString(),
      approved: initial?.approved ?? false,
      createdAt: initial?.createdAt ?? new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    } as unknown as models.SchedulePeriod;
    onSave(sp);
  };

  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3 className="modal-title">{initial ? tx.edit : tx.newPeriod}</h3>
        <div className="modal-field">
          <label className="modal-label">{tx.periodName}</label>
          <input
            className="modal-input"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <div className="modal-field">
          <label className="modal-label">{tx.startDate}</label>
          <input
            className="modal-input"
            type="date"
            value={start}
            onChange={(e) => setStart(e.target.value)}
          />
        </div>
        <div className="modal-field">
          <label className="modal-label">{tx.endDate}</label>
          <input
            className="modal-input"
            type="date"
            value={end}
            onChange={(e) => setEnd(e.target.value)}
          />
        </div>
        {dateOrderInvalid && (
          <div className="coverage-error">{tx.errorDateOrder}</div>
        )}
        <div className="modal-actions">
          <button className="modal-btn" onClick={onCancel}>
            {tx.cancel}
          </button>
          <button
            className="modal-btn modal-btn-primary"
            onClick={handleSave}
            disabled={!canSave}
          >
            {tx.save}
          </button>
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// PeriodDetailView
// =============================================================================

function PeriodDetailView(props: {
  periodId: string;
  scheduleService: ScheduleService;
  regionService: RegionService;
  tx: Tx;
  onError: (e: unknown) => void;
  onBack: () => void;
}) {
  const { periodId, scheduleService, regionService, tx, onError, onBack } =
    props;
  const [period, setPeriod] = useState<models.SchedulePeriod | null>(null);
  const [scopes, setScopes] = useState<models.Scope[]>([]);
  const [tree, setTree] = useState<AreaTreeNode[]>([]);
  const [groups, setGroups] = useState<models.Group[]>([]);
  const [selfId, setSelfId] = useState<string>("");
  const [creatingScope, setCreatingScope] = useState(false);
  const [copyingFromGroups, setCopyingFromGroups] = useState(false);

  const reload = useCallback(async () => {
    try {
      const [p, sc, tr, gs, sid] = await Promise.all([
        scheduleService.getPeriod(periodId),
        scheduleService.listScopes(periodId),
        regionService.loadTree(),
        UserBinding.ListGroups(),
        ScheduleBinding.GetSelfID(),
      ]);
      setPeriod(p);
      setScopes(sc);
      setTree(tr);
      setGroups(gs ?? []);
      setSelfId(sid);
    } catch (e) {
      onError(e);
    }
  }, [periodId, scheduleService, regionService, onError]);

  useEffect(() => {
    void reload();
  }, [reload]);

  if (!period) return <p>...</p>;

  const handleApprove = async () => {
    try {
      if (period.approved) await scheduleService.revoke(selfId, period.id);
      else await scheduleService.approve(selfId, period.id);
      await reload();
    } catch (e) {
      onError(e);
    }
  };

  const handleCreateScope = async (name: string) => {
    try {
      const sc = {
        id: `scope-${Date.now()}`,
        schedulePeriodId: periodId,
        name,
        groupId: "",
        parentAreaIds: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      } as unknown as models.Scope;
      await scheduleService.createScope(sc);
      setCreatingScope(false);
      await reload();
    } catch (e) {
      onError(e);
    }
  };

  const handleCopyFromGroups = async (groupIds: string[]) => {
    try {
      await scheduleService.createScopesFromGroups(periodId, groupIds);
      setCopyingFromGroups(false);
      await reload();
    } catch (e) {
      onError(e);
    }
  };

  const handleDeleteScope = async (id: string) => {
    try {
      await scheduleService.deleteScope(id);
      await reload();
    } catch (e) {
      onError(e);
    }
  };

  const usedParentAreaIds = new Set<string>();
  scopes.forEach((s) =>
    (s.parentAreaIds ?? []).forEach((id) => usedParentAreaIds.add(id)),
  );

  return (
    <section>
      <div>
        <button className="coverage-btn" onClick={onBack}>
          ← {tx.back}
        </button>
      </div>
      <div className="coverage-detail-header">
        <h2>{period.name}</h2>
        <span className="coverage-detail-meta">
          {isoDate(period.startDate)} 〜 {isoDate(period.endDate)}
        </span>
        <span
          className={`coverage-badge ${period.approved ? "coverage-badge-approved" : "coverage-badge-pending"}`}
        >
          {period.approved ? tx.approved : tx.notApproved}
        </span>
        <button className="coverage-btn" onClick={handleApprove}>
          {period.approved ? tx.revokeApproval : tx.approve}
        </button>
      </div>

      <h3>{tx.scopes}</h3>
      <div className="coverage-toolbar">
        <button
          className="coverage-btn coverage-btn-primary"
          onClick={() => setCreatingScope(true)}
        >
          {tx.newScope}
        </button>
        <button
          className="coverage-btn"
          onClick={() => setCopyingFromGroups(true)}
        >
          {tx.copyFromGroups}
        </button>
      </div>

      {scopes.length === 0 ? (
        <p className="coverage-empty">{tx.noScopes}</p>
      ) : (
        scopes.map((sc) => (
          <ScopeCard
            key={sc.id}
            scope={sc}
            tree={tree}
            usedParentAreaIds={usedParentAreaIds}
            scheduleService={scheduleService}
            tx={tx}
            onError={onError}
            onChange={reload}
            onDelete={() => handleDeleteScope(sc.id)}
          />
        ))
      )}

      {creatingScope && (
        <ScopeNameEditor
          tx={tx}
          onSave={handleCreateScope}
          onCancel={() => setCreatingScope(false)}
        />
      )}
      {copyingFromGroups && (
        <GroupSelectorDialog
          groups={groups}
          existingGroupIds={
            new Set(scopes.map((s) => s.groupId).filter(Boolean))
          }
          tx={tx}
          onConfirm={handleCopyFromGroups}
          onCancel={() => setCopyingFromGroups(false)}
        />
      )}
    </section>
  );
}

function ScopeNameEditor(props: {
  tx: Tx;
  onSave: (name: string) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState("");
  return (
    <div className="modal-overlay" onClick={props.onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3 className="modal-title">{props.tx.newScope}</h3>
        <div className="modal-field">
          <label className="modal-label">{props.tx.scopeName}</label>
          <input
            className="modal-input"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <div className="modal-actions">
          <button className="modal-btn" onClick={props.onCancel}>
            {props.tx.cancel}
          </button>
          <button
            className="modal-btn modal-btn-primary"
            onClick={() => props.onSave(name)}
            disabled={!name}
          >
            {props.tx.save}
          </button>
        </div>
      </div>
    </div>
  );
}

function GroupSelectorDialog(props: {
  groups: models.Group[];
  existingGroupIds: Set<string>;
  tx: Tx;
  onConfirm: (groupIds: string[]) => void;
  onCancel: () => void;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  return (
    <div className="modal-overlay" onClick={props.onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3 className="modal-title">{props.tx.selectGroups}</h3>
        {props.groups.length === 0 ? (
          <p className="coverage-empty">—</p>
        ) : (
          <ul className="group-selector-list">
            {props.groups.map((g) => {
              const used = props.existingGroupIds.has(g.id);
              return (
                <li key={g.id}>
                  <label>
                    <input
                      type="checkbox"
                      disabled={used}
                      checked={selected.has(g.id)}
                      onChange={() => toggle(g.id)}
                    />
                    {g.name} {used && <small>({props.tx.assigned})</small>}
                  </label>
                </li>
              );
            })}
          </ul>
        )}
        <div className="modal-actions">
          <button className="modal-btn" onClick={props.onCancel}>
            {props.tx.cancel}
          </button>
          <button
            className="modal-btn modal-btn-primary"
            onClick={() => props.onConfirm(Array.from(selected))}
            disabled={selected.size === 0}
          >
            {props.tx.save}
          </button>
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// ScopeCard
// =============================================================================

function ScopeCard(props: {
  scope: models.Scope;
  tree: AreaTreeNode[];
  usedParentAreaIds: Set<string>;
  scheduleService: ScheduleService;
  tx: Tx;
  onError: (e: unknown) => void;
  onChange: () => Promise<void>;
  onDelete: () => void;
}) {
  const {
    scope,
    tree,
    usedParentAreaIds,
    scheduleService,
    tx,
    onError,
    onChange,
    onDelete,
  } = props;
  const [pickingPA, setPickingPA] = useState(false);
  const [availabilities, setAvailabilities] = useState<
    models.AreaAvailability[]
  >([]);
  const [expanded, setExpanded] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkDialog, setBulkDialog] = useState(false);

  const toggleSelected = (paId: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(paId)) next.delete(paId);
      else next.add(paId);
      return next;
    });
  };
  const toggleSelectAll = () => {
    const ids = scope.parentAreaIds ?? [];
    if (selected.size === ids.length) setSelected(new Set());
    else setSelected(new Set(ids));
  };

  const reloadAvailability = useCallback(async () => {
    try {
      setAvailabilities(await scheduleService.listAvailabilities(scope.id));
    } catch (e) {
      onError(e);
    }
  }, [scheduleService, scope.id, onError]);

  useEffect(() => {
    void reloadAvailability();
  }, [reloadAvailability]);

  const paLabel = new Map<string, string>();
  tree.forEach((r) =>
    r.parentAreas.forEach((pa) =>
      paLabel.set(pa.id, `${r.symbol}-${pa.number} ${pa.name}`),
    ),
  );

  // areaId -> AreaAvailability の引きやすさのためのマップ
  const aaByPA = new Map<string, models.AreaAvailability>();
  availabilities.forEach((aa) => aaByPA.set(aa.areaId, aa));

  const handleAddParentAreas = async (paIds: string[]) => {
    try {
      const updated = {
        ...scope,
        parentAreaIds: [...(scope.parentAreaIds ?? []), ...paIds],
      } as unknown as models.Scope;
      await scheduleService.updateScope(updated);
      const now = new Date().toISOString();
      for (let i = 0; i < paIds.length; i++) {
        const aa = {
          id: `aa-${Date.now()}-${i}`,
          scopeId: scope.id,
          areaId: paIds[i],
          type: "lendable",
          scopeGroupId: "",
          setById: "",
          createdAt: now,
        } as unknown as models.AreaAvailability;
        await scheduleService.createAvailability(aa);
      }
      setPickingPA(false);
      await onChange();
      await reloadAvailability();
    } catch (e) {
      onError(e);
    }
  };

  const handleRemoveParentArea = async (paId: string) => {
    try {
      const aa = aaByPA.get(paId);
      if (aa) await scheduleService.deleteAvailability(aa.id);
      const updated = {
        ...scope,
        parentAreaIds: (scope.parentAreaIds ?? []).filter((id) => id !== paId),
      } as unknown as models.Scope;
      await scheduleService.updateScope(updated);
      await onChange();
      await reloadAvailability();
    } catch (e) {
      onError(e);
    }
  };

  const setStatus = async (paId: string, type: "lendable" | "self_take") => {
    try {
      const existing = aaByPA.get(paId);
      if (existing) {
        const updated = {
          ...existing,
          type,
        } as unknown as models.AreaAvailability;
        await scheduleService.updateAvailability(updated);
      } else {
        const aa = {
          id: `aa-${Date.now()}`,
          scopeId: scope.id,
          areaId: paId,
          type,
          scopeGroupId: "",
          setById: "",
          createdAt: new Date().toISOString(),
        } as unknown as models.AreaAvailability;
        await scheduleService.createAvailability(aa);
      }
      await reloadAvailability();
    } catch (e) {
      onError(e);
    }
  };

  const applyBulkStatus = async (type: "lendable" | "self_take") => {
    for (const paId of selected) {
      await setStatus(paId, type);
    }
    setSelected(new Set());
    setBulkDialog(false);
  };

  return (
    <div className="scope-card">
      <div className="scope-card-header">
        <h4 style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <button
            className="coverage-btn"
            style={{ padding: "2px 8px" }}
            onClick={() => setExpanded((v) => !v)}
          >
            {expanded ? "▼" : "▶"}
          </button>
          {scope.name} {scope.groupId && <small>(group)</small>}
        </h4>
        <button className="coverage-btn coverage-btn-danger" onClick={onDelete}>
          {tx.delete}
        </button>
      </div>

      {expanded && (
        <>
          <div className="coverage-toolbar">
            <button
              className="coverage-btn coverage-btn-primary"
              onClick={() => setPickingPA(true)}
            >
              {tx.addParentArea}
            </button>
            <button
              className="coverage-btn"
              disabled={selected.size === 0}
              onClick={() => setBulkDialog(true)}
            >
              {tx.bulkChangeStatus} ({selected.size})
            </button>
          </div>

          {(scope.parentAreaIds ?? []).length === 0 ? (
            <p className="coverage-empty">{tx.noParentAreas}</p>
          ) : (
            <table className="coverage-table">
              <thead>
                <tr>
                  <th style={{ width: 32 }}>
                    <input
                      type="checkbox"
                      checked={
                        (scope.parentAreaIds ?? []).length > 0 &&
                        selected.size === (scope.parentAreaIds ?? []).length
                      }
                      ref={(el) => {
                        if (el)
                          el.indeterminate =
                            selected.size > 0 &&
                            selected.size < (scope.parentAreaIds ?? []).length;
                      }}
                      onChange={toggleSelectAll}
                    />
                  </th>
                  <th>{tx.parentAreas}</th>
                  <th>{tx.type}</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {(scope.parentAreaIds ?? []).map((paId) => {
                  const aa = aaByPA.get(paId);
                  const t = aa?.type ?? "lendable";
                  return (
                    <tr key={paId}>
                      <td>
                        <input
                          type="checkbox"
                          checked={selected.has(paId)}
                          onChange={() => toggleSelected(paId)}
                        />
                      </td>
                      <td>{paLabel.get(paId) ?? paId}</td>
                      <td>
                        <span
                          className={`coverage-badge ${t === "lendable" ? "coverage-badge-lendable" : "coverage-badge-selftake"}`}
                        >
                          {t === "lendable" ? tx.lendable : tx.selfTake}
                        </span>
                      </td>
                      <td>
                        <button
                          className="coverage-btn coverage-btn-danger"
                          onClick={() => handleRemoveParentArea(paId)}
                        >
                          {tx.delete}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </>
      )}

      {bulkDialog && (
        <div className="modal-overlay" onClick={() => setBulkDialog(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3 className="modal-title">{tx.bulkChangeStatus}</h3>
            <p style={{ marginBottom: 12 }}>
              {tx.bulkSelectedCount.replace("{n}", String(selected.size))}
            </p>
            <div className="modal-actions">
              <button
                className="modal-btn"
                onClick={() => setBulkDialog(false)}
              >
                {tx.cancel}
              </button>
              <button
                className="modal-btn"
                onClick={() => void applyBulkStatus("lendable")}
              >
                {tx.lendable}
              </button>
              <button
                className="modal-btn modal-btn-primary"
                onClick={() => void applyBulkStatus("self_take")}
              >
                {tx.selfTake}
              </button>
            </div>
          </div>
        </div>
      )}

      {pickingPA && (
        <ParentAreaPicker
          tree={tree}
          excludeIds={usedParentAreaIds}
          tx={tx}
          onConfirm={handleAddParentAreas}
          onCancel={() => setPickingPA(false)}
        />
      )}
    </div>
  );
}

function ParentAreaPicker(props: {
  tree: AreaTreeNode[];
  excludeIds: Set<string>;
  tx: Tx;
  onConfirm: (paIds: string[]) => void;
  onCancel: () => void;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  return (
    <div className="modal-overlay" onClick={props.onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3 className="modal-title">{props.tx.addParentArea}</h3>
        <div className="parent-area-picker-list">
          {props.tree.map((r) => (
            <div key={r.id}>
              <strong>
                {r.symbol} {r.name}
              </strong>
              <ul>
                {r.parentAreas.map((pa) => {
                  const used = props.excludeIds.has(pa.id);
                  return (
                    <li key={pa.id}>
                      <label
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 6,
                          cursor: used ? "not-allowed" : "pointer",
                          color: used ? "#94a3b8" : undefined,
                        }}
                      >
                        <input
                          type="checkbox"
                          disabled={used}
                          checked={selected.has(pa.id)}
                          onChange={() => toggle(pa.id)}
                        />
                        {pa.number} {pa.name}{" "}
                        {used && <small>({props.tx.assigned})</small>}
                      </label>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
        <div className="modal-actions">
          <button className="modal-btn" onClick={props.onCancel}>
            {props.tx.cancel}
          </button>
          <button
            className="modal-btn modal-btn-primary"
            disabled={selected.size === 0}
            onClick={() => props.onConfirm(Array.from(selected))}
          >
            {props.tx.save}
          </button>
        </div>
      </div>
    </div>
  );
}
