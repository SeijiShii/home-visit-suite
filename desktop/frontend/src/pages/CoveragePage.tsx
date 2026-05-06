import { useEffect, useState, useCallback, useMemo } from "react";
import { useI18n } from "../contexts/I18nContext";
import { useIdentity } from "../contexts/IdentityContext";
import * as AvailablePeriodBinding from "../../wailsjs/go/binding/AvailablePeriodBinding";
import * as RegionBinding from "../../wailsjs/go/binding/RegionBinding";
import { models } from "../../wailsjs/go/models";

/**
 * 網羅管理画面（/coverage）。
 * AvailablePeriod（チェックアウト可能期間）の管理と進捗参照を統合する。
 * 仕様 docs/wants/06_網羅管理.md「チェックアウト可能期間（AvailablePeriod）」
 *      docs/wants/10_画面設計.md「6. 網羅管理 /coverage」
 *
 * 進捗参照（区域別・区域親番別の達成率、過去記録ビュー）は別フェーズで実装する。
 */

type Phase = "pending" | "active" | "closed";

interface ParentAreaOption {
  id: string;
  number: string;
  name: string;
  regionId: string;
  regionSymbol: string;
  regionName: string;
}

function periodPhase(p: models.AvailablePeriod, now: Date): Phase {
  const start = new Date(String(p.startDate));
  const end = new Date(String(p.endDate));
  if (now < start) return "pending";
  if (now > end) return "closed";
  return "active";
}

export function CoveragePage() {
  const { t } = useI18n();
  const c = t.coverage;
  const { currentActorID } = useIdentity();

  const [periods, setPeriods] = useState<models.AvailablePeriod[]>([]);
  const [activePeriod, setActivePeriod] =
    useState<models.AvailablePeriod | null>(null);
  const [tags, setTags] = useState<models.AvailablePeriodTag[]>([]);
  const [parentAreas, setParentAreas] = useState<ParentAreaOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [editTarget, setEditTarget] = useState<models.AvailablePeriod | null>(
    null,
  );
  const [showAddTag, setShowAddTag] = useState(false);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const [list, active, tagList, regions] = await Promise.all([
        AvailablePeriodBinding.ListPeriods(),
        AvailablePeriodBinding.GetActivePeriod(),
        AvailablePeriodBinding.ListTags(),
        RegionBinding.ListRegions(),
      ]);
      setPeriods(list ?? []);
      setActivePeriod(active);
      setTags(tagList ?? []);

      // 区域親番を全領域から集約
      const paOptions: ParentAreaOption[] = [];
      for (const r of regions ?? []) {
        const pas = (await RegionBinding.ListParentAreas(r.id)) ?? [];
        for (const pa of pas) {
          paOptions.push({
            id: pa.id,
            number: pa.number,
            name: pa.name,
            regionId: r.id,
            regionSymbol: r.symbol,
            regionName: r.name,
          });
        }
      }
      setParentAreas(paOptions);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const tagsById = useMemo(
    () => new Map(tags.map((tg) => [tg.id, tg])),
    [tags],
  );

  const handleDelete = async (period: models.AvailablePeriod) => {
    if (!window.confirm(c.confirmDelete({ name: period.name }))) return;
    try {
      await AvailablePeriodBinding.DeletePeriod(currentActorID, period.id);
      await reload();
    } catch (e) {
      setError(String(e));
    }
  };

  const handleDeleteTag = async (tag: models.AvailablePeriodTag) => {
    const count = periods.filter((p) =>
      (p.tagIds ?? []).includes(tag.id),
    ).length;
    if (
      !window.confirm(c.confirmDeleteTag({ name: tag.name, count }))
    )
      return;
    try {
      await AvailablePeriodBinding.DeleteTag(currentActorID, tag.id);
      await reload();
    } catch (e) {
      setError(String(e));
    }
  };

  const phaseLabel = (p: Phase): string => {
    switch (p) {
      case "pending":
        return c.phasePending;
      case "active":
        return c.phaseActive;
      case "closed":
        return c.phaseClosed;
    }
  };

  const now = new Date();

  return (
    <div className="coverage-page">
      <div className="coverage-page-header">
        <h1>{c.title}</h1>
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => setShowCreate(true)}
        >
          {c.newPeriod}
        </button>
      </div>

      {error && (
        <div className="coverage-page-error" role="alert">
          {error}
        </div>
      )}

      {activePeriod && (
        <section className="coverage-active-period">
          <h2>{c.activePeriod}</h2>
          <div>
            <strong>{activePeriod.name}</strong>{" "}
            <span>
              {String(activePeriod.startDate).slice(0, 10)} -{" "}
              {String(activePeriod.endDate).slice(0, 10)}
            </span>
          </div>
        </section>
      )}

      <section className="coverage-period-list">
        <h2>{c.periodList}</h2>
        {loading ? (
          <div>{c.loading}</div>
        ) : periods.length === 0 ? (
          <div>{c.noPeriods}</div>
        ) : (
          <table className="coverage-period-table">
            <thead>
              <tr>
                <th>{c.colName}</th>
                <th>{c.phaseLabel}</th>
                <th>{c.colStart}</th>
                <th>{c.colEnd}</th>
                <th>{c.colParentAreas}</th>
                <th>{c.colTags}</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {periods.map((p) => {
                const phase = periodPhase(p, now);
                return (
                  <tr key={p.id}>
                    <td>{p.name}</td>
                    <td>
                      <span className={`coverage-phase coverage-phase-${phase}`}>
                        {phaseLabel(phase)}
                      </span>
                    </td>
                    <td>{String(p.startDate).slice(0, 10)}</td>
                    <td>{String(p.endDate).slice(0, 10)}</td>
                    <td>{(p.parentAreaIds ?? []).length}</td>
                    <td>
                      {(p.tagIds ?? []).map((tid) => {
                        const tg = tagsById.get(tid);
                        if (!tg) return null;
                        return (
                          <span
                            key={tid}
                            className="coverage-tag-chip"
                            style={{
                              borderColor: tg.color,
                              color: tg.color,
                            }}
                          >
                            {tg.name}
                          </span>
                        );
                      })}
                    </td>
                    <td>
                      <button
                        type="button"
                        className="btn btn-sm"
                        onClick={() => setEditTarget(p)}
                      >
                        {c.edit}
                      </button>
                      {phase === "pending" && (
                        <button
                          type="button"
                          className="btn btn-sm"
                          onClick={() => void handleDelete(p)}
                        >
                          {c.delete}
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>

      <section className="coverage-tags">
        <div className="coverage-tags-header">
          <h2>{c.tagsSection}</h2>
          <button
            type="button"
            className="btn btn-sm"
            onClick={() => setShowAddTag(true)}
          >
            {c.addTag}
          </button>
        </div>
        {tags.length === 0 ? (
          <div>{c.noTags}</div>
        ) : (
          <div className="coverage-tags-list">
            {tags.map((tg) => (
              <span
                key={tg.id}
                className="coverage-tag-chip-action"
                style={{ borderColor: tg.color, color: tg.color }}
              >
                {tg.name}
                <button
                  type="button"
                  className="coverage-tag-chip-delete"
                  onClick={() => void handleDeleteTag(tg)}
                  aria-label={c.delete}
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        )}
      </section>

      {showCreate && (
        <PeriodDialog
          mode="create"
          actorId={currentActorID}
          parentAreas={parentAreas}
          tags={tags}
          onClose={() => setShowCreate(false)}
          onSaved={async () => {
            setShowCreate(false);
            await reload();
          }}
          onError={(msg) => setError(msg)}
          c={c}
        />
      )}

      {editTarget && (
        <PeriodDialog
          mode="edit"
          period={editTarget}
          actorId={currentActorID}
          parentAreas={parentAreas}
          tags={tags}
          onClose={() => setEditTarget(null)}
          onSaved={async () => {
            setEditTarget(null);
            await reload();
          }}
          onError={(msg) => setError(msg)}
          c={c}
        />
      )}

      {showAddTag && (
        <AddTagDialog
          actorId={currentActorID}
          onClose={() => setShowAddTag(false)}
          onSaved={async () => {
            setShowAddTag(false);
            await reload();
          }}
          onError={(msg) => setError(msg)}
          c={c}
        />
      )}
    </div>
  );
}

interface PeriodDialogProps {
  mode: "create" | "edit";
  period?: models.AvailablePeriod;
  actorId: string;
  parentAreas: ParentAreaOption[];
  tags: models.AvailablePeriodTag[];
  onClose: () => void;
  onSaved: () => void | Promise<void>;
  onError: (msg: string) => void;
  c: ReturnType<typeof useI18n>["t"]["coverage"];
}

function PeriodDialog({
  mode,
  period,
  actorId,
  parentAreas,
  tags,
  onClose,
  onSaved,
  onError,
  c,
}: PeriodDialogProps) {
  const today = new Date().toISOString().slice(0, 10);
  const [name, setName] = useState(period?.name ?? "");
  const [startDate, setStartDate] = useState(
    period ? String(period.startDate).slice(0, 10) : today,
  );
  const [endDate, setEndDate] = useState(
    period ? String(period.endDate).slice(0, 10) : today,
  );
  const [selectedPaIds, setSelectedPaIds] = useState<Set<string>>(
    new Set(period?.parentAreaIds ?? []),
  );
  const [selectedTagIds, setSelectedTagIds] = useState<Set<string>>(
    new Set(period?.tagIds ?? []),
  );
  const [submitting, setSubmitting] = useState(false);

  const phase: Phase = period ? periodPhase(period, new Date()) : "pending";

  const isLockedField = (field: "name" | "start" | "end" | "pa"): boolean => {
    if (mode === "create" || phase === "pending") return false;
    if (phase === "active") {
      // active: end は延長のみ可、name/start は不可、pa は追加のみ可
      if (field === "name" || field === "start") return true;
      return false;
    }
    // closed: 全て不可（タグだけ可）
    return true;
  };

  const togglePa = (id: string) => {
    if (mode === "edit" && phase === "active") {
      // 既存の id は外せない
      const original = new Set(period?.parentAreaIds ?? []);
      if (original.has(id) && selectedPaIds.has(id)) return;
    }
    setSelectedPaIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleTag = (id: string) => {
    setSelectedTagIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const groupedByRegion = useMemo(() => {
    const map = new Map<
      string,
      { regionSymbol: string; regionName: string; areas: ParentAreaOption[] }
    >();
    for (const pa of parentAreas) {
      const entry = map.get(pa.regionId);
      if (entry) {
        entry.areas.push(pa);
      } else {
        map.set(pa.regionId, {
          regionSymbol: pa.regionSymbol,
          regionName: pa.regionName,
          areas: [pa],
        });
      }
    }
    return map;
  }, [parentAreas]);

  const handleSelectAllInRegion = (regionId: string, select: boolean) => {
    const entry = groupedByRegion.get(regionId);
    if (!entry) return;
    const original = new Set(period?.parentAreaIds ?? []);
    setSelectedPaIds((prev) => {
      const next = new Set(prev);
      for (const pa of entry.areas) {
        if (select) {
          next.add(pa.id);
        } else {
          // active 中は既存 id を外せない
          if (mode === "edit" && phase === "active" && original.has(pa.id))
            continue;
          next.delete(pa.id);
        }
      }
      return next;
    });
  };

  const handleSubmit = async () => {
    if (!name) return;
    setSubmitting(true);
    try {
      const start = new Date(startDate);
      const end = new Date(endDate);
      const paIds = Array.from(selectedPaIds);
      const tagIds = Array.from(selectedTagIds);
      if (mode === "create") {
        await AvailablePeriodBinding.CreatePeriod(actorId, {
          name,
          startDate: start,
          endDate: end,
          parentAreaIds: paIds,
          tagIds,
        } as unknown as Parameters<
          typeof AvailablePeriodBinding.CreatePeriod
        >[1]);
      } else if (period) {
        // 編集: フェーズに応じて変更可能なフィールドのみ送る
        const update: Record<string, unknown> = {};
        if (phase === "pending") {
          update.name = name;
          update.startDate = start;
          update.endDate = end;
          update.parentAreaIds = paIds;
          update.tagIds = tagIds;
        } else if (phase === "active") {
          update.endDate = end;
          update.parentAreaIds = paIds;
          update.tagIds = tagIds;
        } else {
          // closed: tag のみ
          update.tagIds = tagIds;
        }
        await AvailablePeriodBinding.UpdatePeriod(
          actorId,
          period.id,
          update as unknown as Parameters<
            typeof AvailablePeriodBinding.UpdatePeriod
          >[2],
        );
      }
      await onSaved();
    } catch (e) {
      onError(String(e));
      setSubmitting(false);
    }
  };

  const lockNotice =
    mode === "edit"
      ? phase === "active"
        ? c.editLockNotice.active
        : phase === "closed"
          ? c.editLockNotice.closed
          : null
      : null;

  return (
    <div className="coverage-dialog-backdrop" onClick={onClose}>
      <div
        className="coverage-dialog"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label={mode === "create" ? c.newPeriod : c.editPeriod}
      >
        <div className="coverage-dialog-title">
          {mode === "create" ? c.newPeriod : c.editPeriod}
        </div>
        {lockNotice && <div className="coverage-dialog-lock">{lockNotice}</div>}

        <div className="coverage-dialog-row">
          <label>{c.colName}</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={100}
            disabled={isLockedField("name")}
          />
        </div>
        <div className="coverage-dialog-row">
          <label>{c.colStart}</label>
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            disabled={isLockedField("start")}
          />
        </div>
        <div className="coverage-dialog-row">
          <label>{c.colEnd}</label>
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            disabled={isLockedField("end")}
          />
        </div>

        <div className="coverage-dialog-section">
          <h3>{c.parentAreasSection}</h3>
          {parentAreas.length === 0 ? (
            <div>{c.noParentAreas}</div>
          ) : (
            <div className="coverage-pa-tree">
              {Array.from(groupedByRegion.entries()).map(([regionId, entry]) => (
                <div key={regionId} className="coverage-pa-region">
                  <div className="coverage-pa-region-header">
                    <span className="coverage-pa-region-name">
                      {entry.regionSymbol} {entry.regionName}
                    </span>
                    <button
                      type="button"
                      className="btn btn-sm"
                      onClick={() => handleSelectAllInRegion(regionId, true)}
                      disabled={phase === "closed"}
                    >
                      {c.selectAllInRegion}
                    </button>
                    <button
                      type="button"
                      className="btn btn-sm"
                      onClick={() => handleSelectAllInRegion(regionId, false)}
                      disabled={phase === "closed"}
                    >
                      {c.clearAllInRegion}
                    </button>
                  </div>
                  <div className="coverage-pa-list">
                    {entry.areas.map((pa) => {
                      const checked = selectedPaIds.has(pa.id);
                      const original = new Set(period?.parentAreaIds ?? []);
                      const lockedRemoval =
                        mode === "edit" &&
                        phase === "active" &&
                        original.has(pa.id);
                      return (
                        <label key={pa.id} className="coverage-pa-item">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => togglePa(pa.id)}
                            disabled={phase === "closed" || lockedRemoval}
                          />
                          <span>
                            {pa.number}
                            {pa.name ? ` ${pa.name}` : ""}
                          </span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="coverage-dialog-section">
          <h3>{c.tagsSection}</h3>
          {tags.length === 0 ? (
            <div>{c.noTags}</div>
          ) : (
            <div className="coverage-tag-select">
              {tags.map((tg) => {
                const checked = selectedTagIds.has(tg.id);
                return (
                  <label
                    key={tg.id}
                    className={`coverage-tag-toggle ${
                      checked ? "coverage-tag-toggle-on" : ""
                    }`}
                    style={{
                      borderColor: tg.color,
                      color: checked ? tg.color : undefined,
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleTag(tg.id)}
                    />
                    {tg.name}
                  </label>
                );
              })}
            </div>
          )}
        </div>

        <div className="coverage-dialog-actions">
          <button type="button" className="btn" onClick={onClose}>
            {c.cancel}
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => void handleSubmit()}
            disabled={!name || submitting}
          >
            {mode === "create" ? c.create : c.save}
          </button>
        </div>
      </div>
    </div>
  );
}

interface AddTagDialogProps {
  actorId: string;
  onClose: () => void;
  onSaved: () => void | Promise<void>;
  onError: (msg: string) => void;
  c: ReturnType<typeof useI18n>["t"]["coverage"];
}

function AddTagDialog({
  actorId,
  onClose,
  onSaved,
  onError,
  c,
}: AddTagDialogProps) {
  const [name, setName] = useState("");
  const [color, setColor] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleCreate = async () => {
    if (!name) return;
    setSubmitting(true);
    try {
      await AvailablePeriodBinding.CreateTag(actorId, name, color);
      await onSaved();
    } catch (e) {
      onError(String(e));
      setSubmitting(false);
    }
  };

  return (
    <div className="coverage-dialog-backdrop" onClick={onClose}>
      <div
        className="coverage-dialog"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label={c.addTag}
      >
        <div className="coverage-dialog-title">{c.addTag}</div>
        <div className="coverage-dialog-row">
          <label>{c.tagName}</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={16}
          />
        </div>
        <div className="coverage-dialog-row">
          <label>{c.tagColor}</label>
          <input
            type="color"
            value={color || "#3b82f6"}
            onChange={(e) => setColor(e.target.value)}
          />
        </div>
        <div className="coverage-dialog-actions">
          <button type="button" className="btn" onClick={onClose}>
            {c.cancel}
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => void handleCreate()}
            disabled={!name || submitting}
          >
            {c.create}
          </button>
        </div>
      </div>
    </div>
  );
}
