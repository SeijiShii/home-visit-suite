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
  const scheduleService = useMemo(() => new ScheduleService(ScheduleBinding), []);
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
    <>
      <h1>{t.coverage.title}</h1>
      {error && <div className="error-banner" style={{ color: "red" }}>{error}</div>}
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
    </>
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
      <div style={{ marginBottom: 12 }}>
        <button onClick={() => setCreating(true)}>{tx.newPeriod}</button>
      </div>
      {periods.length === 0 ? (
        <p>—</p>
      ) : (
        <table>
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
                  <a
                    onClick={() => onOpen(p.id)}
                    style={{ cursor: "pointer", textDecoration: "underline" }}
                  >
                    {p.name}
                  </a>
                </td>
                <td>{isoDate(p.startDate)}</td>
                <td>{isoDate(p.endDate)}</td>
                <td>{p.approved ? tx.approved : tx.notApproved}</td>
                <td>
                  <button onClick={() => setEditing(p)}>{tx.edit}</button>{" "}
                  <button onClick={() => handleDelete(p.id)}>{tx.delete}</button>
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

  const handleSave = () => {
    const sp = models.SchedulePeriod.createFrom({
      id: initial?.id ?? `sp-${Date.now()}`,
      name,
      startDate: new Date(start),
      endDate: new Date(end),
      approved: initial?.approved ?? false,
      createdAt: initial?.createdAt ?? new Date(),
      updatedAt: new Date(),
    });
    onSave(sp);
  };

  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>{initial ? tx.edit : tx.newPeriod}</h3>
        <label>
          {tx.periodName}
          <input value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <label>
          {tx.startDate}
          <input type="date" value={start} onChange={(e) => setStart(e.target.value)} />
        </label>
        <label>
          {tx.endDate}
          <input type="date" value={end} onChange={(e) => setEnd(e.target.value)} />
        </label>
        <div style={{ marginTop: 12 }}>
          <button onClick={handleSave} disabled={!name || !start || !end}>
            {tx.save}
          </button>{" "}
          <button onClick={onCancel}>{tx.cancel}</button>
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
  const { periodId, scheduleService, regionService, tx, onError, onBack } = props;
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
      const sc = models.Scope.createFrom({
        id: `scope-${Date.now()}`,
        schedulePeriodId: periodId,
        name,
        groupId: "",
        parentAreaIds: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      });
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
        <button onClick={onBack}>← {tx.back}</button>
      </div>
      <h2>
        {period.name}{" "}
        <span style={{ fontSize: "0.7em" }}>
          ({isoDate(period.startDate)} 〜 {isoDate(period.endDate)})
        </span>{" "}
        <span style={{ color: period.approved ? "green" : "gray" }}>
          [{period.approved ? tx.approved : tx.notApproved}]
        </span>{" "}
        <button onClick={handleApprove}>
          {period.approved ? tx.revokeApproval : tx.approve}
        </button>
      </h2>

      <h3>{tx.scopes}</h3>
      <div style={{ marginBottom: 8 }}>
        <button onClick={() => setCreatingScope(true)}>{tx.newScope}</button>{" "}
        <button onClick={() => setCopyingFromGroups(true)}>{tx.copyFromGroups}</button>
      </div>

      {scopes.length === 0 ? (
        <p>{tx.noScopes}</p>
      ) : (
        scopes.map((sc) => (
          <ScopeCard
            key={sc.id}
            scope={sc}
            period={period}
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
          existingGroupIds={new Set(scopes.map((s) => s.groupId).filter(Boolean))}
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
        <h3>{props.tx.newScope}</h3>
        <label>
          {props.tx.scopeName}
          <input value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <div style={{ marginTop: 12 }}>
          <button onClick={() => props.onSave(name)} disabled={!name}>
            {props.tx.save}
          </button>{" "}
          <button onClick={props.onCancel}>{props.tx.cancel}</button>
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
        <h3>{props.tx.selectGroups}</h3>
        {props.groups.length === 0 ? (
          <p>—</p>
        ) : (
          <ul>
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
                    {g.name} {used && <small>(已)</small>}
                  </label>
                </li>
              );
            })}
          </ul>
        )}
        <div style={{ marginTop: 12 }}>
          <button
            onClick={() => props.onConfirm(Array.from(selected))}
            disabled={selected.size === 0}
          >
            {props.tx.save}
          </button>{" "}
          <button onClick={props.onCancel}>{props.tx.cancel}</button>
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
  period: models.SchedulePeriod;
  tree: AreaTreeNode[];
  usedParentAreaIds: Set<string>;
  scheduleService: ScheduleService;
  tx: Tx;
  onError: (e: unknown) => void;
  onChange: () => Promise<void>;
  onDelete: () => void;
}) {
  const {
    scope, period, tree, usedParentAreaIds, scheduleService, tx,
    onError, onChange, onDelete,
  } = props;
  const [pickingPA, setPickingPA] = useState(false);
  const [availabilities, setAvailabilities] = useState<models.AreaAvailability[]>([]);
  const [showAvailability, setShowAvailability] = useState(false);
  const [addingAvailability, setAddingAvailability] = useState(false);

  const reloadAvailability = useCallback(async () => {
    try {
      setAvailabilities(await scheduleService.listAvailabilities(scope.id));
    } catch (e) {
      onError(e);
    }
  }, [scheduleService, scope.id, onError]);

  useEffect(() => {
    if (showAvailability) void reloadAvailability();
  }, [showAvailability, reloadAvailability]);

  const handleAddParentArea = async (paId: string) => {
    try {
      const updated = models.Scope.createFrom({
        ...scope,
        parentAreaIds: [...(scope.parentAreaIds ?? []), paId],
      });
      await scheduleService.updateScope(updated);
      setPickingPA(false);
      await onChange();
    } catch (e) {
      onError(e);
    }
  };

  const handleRemoveParentArea = async (paId: string) => {
    try {
      const updated = models.Scope.createFrom({
        ...scope,
        parentAreaIds: (scope.parentAreaIds ?? []).filter((id) => id !== paId),
      });
      await scheduleService.updateScope(updated);
      await onChange();
    } catch (e) {
      onError(e);
    }
  };

  const paLabel = new Map<string, string>();
  tree.forEach((r) =>
    r.parentAreas.forEach((pa) =>
      paLabel.set(pa.id, `${r.symbol}-${pa.number} ${pa.name}`),
    ),
  );

  const areasInScope: { id: string; label: string }[] = [];
  tree.forEach((r) =>
    r.parentAreas.forEach((pa) => {
      if ((scope.parentAreaIds ?? []).includes(pa.id)) {
        pa.areas.forEach((a) =>
          areasInScope.push({
            id: a.id,
            label: `${r.symbol}-${pa.number}-${a.number}`,
          }),
        );
      }
    }),
  );

  return (
    <div style={{ border: "1px solid #ccc", padding: 12, marginBottom: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between" }}>
        <h4>
          {scope.name} {scope.groupId && <small>(group)</small>}
        </h4>
        <button onClick={onDelete}>{tx.delete}</button>
      </div>

      <div>
        <strong>{tx.parentAreas}:</strong>{" "}
        {(scope.parentAreaIds ?? []).length === 0 ? (
          <em>{tx.noParentAreas}</em>
        ) : (
          (scope.parentAreaIds ?? []).map((id) => (
            <span key={id} style={{ marginRight: 8 }}>
              {paLabel.get(id) ?? id}{" "}
              <button onClick={() => handleRemoveParentArea(id)}>×</button>
            </span>
          ))
        )}{" "}
        <button onClick={() => setPickingPA(true)}>{tx.addParentArea}</button>
      </div>

      <div style={{ marginTop: 8 }}>
        <button onClick={() => setShowAvailability((v) => !v)}>
          {tx.availability} {showAvailability ? "▼" : "▶"}
        </button>
      </div>

      {showAvailability && (
        <div style={{ marginTop: 8, paddingLeft: 12 }}>
          {availabilities.length === 0 ? (
            <p>
              <em>{tx.noAvailability}</em>
            </p>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>{tx.area}</th>
                  <th>{tx.type}</th>
                  <th>{tx.startDate}</th>
                  <th>{tx.endDate}</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {availabilities.map((aa) => (
                  <tr key={aa.id}>
                    <td>{aa.areaId}</td>
                    <td>{aa.type === "lendable" ? tx.lendable : tx.selfTake}</td>
                    <td>{isoDate(aa.startDate)}</td>
                    <td>{isoDate(aa.endDate)}</td>
                    <td>
                      <button
                        onClick={async () => {
                          try {
                            await scheduleService.deleteAvailability(aa.id);
                            await reloadAvailability();
                          } catch (e) {
                            onError(e);
                          }
                        }}
                      >
                        {tx.delete}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <button onClick={() => setAddingAvailability(true)}>
            {tx.addAvailability}
          </button>
        </div>
      )}

      {pickingPA && (
        <ParentAreaPicker
          tree={tree}
          excludeIds={usedParentAreaIds}
          tx={tx}
          onPick={handleAddParentArea}
          onCancel={() => setPickingPA(false)}
        />
      )}

      {addingAvailability && (
        <AvailabilityEditor
          scopeId={scope.id}
          period={period}
          areas={areasInScope}
          tx={tx}
          onSave={async (aa) => {
            try {
              await scheduleService.createAvailability(aa);
              setAddingAvailability(false);
              await reloadAvailability();
            } catch (e) {
              onError(e);
            }
          }}
          onCancel={() => setAddingAvailability(false)}
        />
      )}
    </div>
  );
}

function ParentAreaPicker(props: {
  tree: AreaTreeNode[];
  excludeIds: Set<string>;
  tx: Tx;
  onPick: (paId: string) => void;
  onCancel: () => void;
}) {
  return (
    <div className="modal-overlay" onClick={props.onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>{props.tx.addParentArea}</h3>
        <div style={{ maxHeight: 300, overflowY: "auto" }}>
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
                      <button disabled={used} onClick={() => props.onPick(pa.id)}>
                        {pa.number} {pa.name} {used && <small>(已)</small>}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
        <button onClick={props.onCancel}>{props.tx.cancel}</button>
      </div>
    </div>
  );
}

function AvailabilityEditor(props: {
  scopeId: string;
  period: models.SchedulePeriod;
  areas: { id: string; label: string }[];
  tx: Tx;
  onSave: (aa: models.AreaAvailability) => void;
  onCancel: () => void;
}) {
  const [areaId, setAreaId] = useState(props.areas[0]?.id ?? "");
  const [type, setType] = useState<"lendable" | "self_take">("lendable");
  const [start, setStart] = useState(isoDate(props.period.startDate));
  const [end, setEnd] = useState(isoDate(props.period.endDate));

  const handleSave = () => {
    const aa = models.AreaAvailability.createFrom({
      id: `aa-${Date.now()}`,
      scopeId: props.scopeId,
      areaId,
      type,
      scopeGroupId: "",
      startDate: new Date(start),
      endDate: new Date(end),
      setById: "",
      createdAt: new Date(),
    });
    props.onSave(aa);
  };

  return (
    <div className="modal-overlay" onClick={props.onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>{props.tx.addAvailability}</h3>
        <label>
          {props.tx.area}
          <select value={areaId} onChange={(e) => setAreaId(e.target.value)}>
            {props.areas.map((a) => (
              <option key={a.id} value={a.id}>
                {a.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          {props.tx.type}
          <select
            value={type}
            onChange={(e) => setType(e.target.value as "lendable" | "self_take")}
          >
            <option value="lendable">{props.tx.lendable}</option>
            <option value="self_take">{props.tx.selfTake}</option>
          </select>
        </label>
        <label>
          {props.tx.startDate}
          <input type="date" value={start} onChange={(e) => setStart(e.target.value)} />
        </label>
        <label>
          {props.tx.endDate}
          <input type="date" value={end} onChange={(e) => setEnd(e.target.value)} />
        </label>
        <div style={{ marginTop: 12 }}>
          <button onClick={handleSave} disabled={!areaId || !start || !end}>
            {props.tx.save}
          </button>{" "}
          <button onClick={props.onCancel}>{props.tx.cancel}</button>
        </div>
      </div>
    </div>
  );
}
