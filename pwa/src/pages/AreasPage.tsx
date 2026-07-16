// 区域一覧 `/areas`（編集メンバー以上専用）。
// 区域親番の一覧テーブル → 行展開で配下区域のチェックアウト状況を俯瞰し、
// その場で担当者の割り当て・回収・招待管理を行う（旧チェックアウト管理 `/checkouts` を置き換えた）。
// 仕様: docs/wants/10_画面設計.md「区域一覧 /areas」

import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useSharedApplied } from "../hooks/useSharedApplied";
import {
  AREA_TREE_TABLES,
  CHECKOUT_TABLES,
} from "../lib/linkself/shared-events";
import { InviteDialog } from "../components/InviteDialog";
import { useI18n } from "../contexts/I18nContext";
import { useIdentity } from "../contexts/IdentityContext";
import { useServices } from "../contexts/ServicesContext";
import type { User } from "../domain/models/user";
import {
  buildRegionTreeIndex,
  type RegionTreeIndex,
} from "../lib/region-tree-index";

/** 区域行に表示するアクティブなチェックアウトの要約 */
interface ActiveCheckoutInfo {
  checkoutId: string;
  ownerId: string;
  ownerName: string;
  date: string;
}

/** 親番行（領域記号を含む表示 ID で一意化） */
interface ParentRow {
  id: string;
  /** 例: NRT-001 */
  display: string;
  name: string;
  areaCount: number;
}

/** 展開時の区域行 */
interface AreaRow {
  areaId: string;
  /** 例: NRT-001-05 */
  displayName: string;
  hasPolygon: boolean;
  /** アクティブなチェックアウト（無ければ null） */
  checkout: ActiveCheckoutInfo | null;
}

function formatDate(iso: string): string {
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    return d.toLocaleDateString();
  } catch {
    return iso;
  }
}

export function AreasPage() {
  const { t } = useI18n();
  const a = t.areas;
  const { currentActorID } = useIdentity();
  const services = useServices();
  const navigate = useNavigate();

  const [tree, setTree] = useState<RegionTreeIndex | null>(null);
  const [checkoutByArea, setCheckoutByArea] = useState<
    Map<string, ActiveCheckoutInfo>
  >(new Map());
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [assignTarget, setAssignTarget] = useState<{
    areaId: string;
    displayName: string;
  } | null>(null);
  const [inviteTarget, setInviteTarget] = useState<{
    checkoutId: string;
    ownerId: string;
    displayName: string;
  } | null>(null);
  const [reloadTick, setReloadTick] = useState(0);

  // ScopeNetwork 同期の受信（他メンバー・他端末の区域/チェックアウト/メンバー変更）で
  // 一覧を再読込する。
  useSharedApplied([...AREA_TREE_TABLES, ...CHECKOUT_TABLES, "users"], () =>
    setReloadTick((tick) => tick + 1),
  );

  useEffect(() => {
    if (!currentActorID) {
      setTree(null);
      setLoading(false);
      return;
    }
    let cancelled = false;
    async function fetchAll() {
      setLoading(true);
      try {
        const [idx, allUsers] = await Promise.all([
          buildRegionTreeIndex(services.regionRepo),
          services.userRepo.listUsers().catch(() => [] as User[]),
        ]);
        if (cancelled) return;
        const areaIds: string[] = [];
        for (const [, areas] of idx.areasByParent) {
          for (const ar of areas) areaIds.push(ar.id);
        }
        const activeCheckouts = await Promise.all(
          areaIds.map((id) =>
            services.checkoutRepo.getActiveCheckout(id).catch(() => null),
          ),
        );
        if (cancelled) return;
        const userById = new Map<string, string>();
        for (const u of allUsers) userById.set(u.id, u.name || u.id);
        const byArea = new Map<string, ActiveCheckoutInfo>();
        areaIds.forEach((id, i) => {
          const co = activeCheckouts[i];
          if (!co) return;
          byArea.set(id, {
            checkoutId: co.id,
            ownerId: co.personInChargeId,
            ownerName: userById.get(co.personInChargeId) ?? co.personInChargeId,
            date: formatDate(co.createdAt),
          });
        });
        setTree(idx);
        setUsers(allUsers);
        setCheckoutByArea(byArea);
      } catch (e) {
        console.error("AreasPage fetch failed", e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void fetchAll();
    return () => {
      cancelled = true;
    };
  }, [currentActorID, reloadTick, services]);

  // 親番行の一覧（領域→親番の順で平坦化）
  const parentRows = useMemo<ParentRow[]>(() => {
    if (!tree) return [];
    const rows: ParentRow[] = [];
    for (const r of tree.regions) {
      for (const pa of tree.parentAreasByRegion.get(r.id) ?? []) {
        rows.push({
          id: pa.id,
          display: `${r.symbol}-${pa.number}`,
          name: pa.name,
          areaCount: tree.areasByParent.get(pa.id)?.length ?? 0,
        });
      }
    }
    rows.sort((x, y) => x.display.localeCompare(y.display));
    return rows;
  }, [tree]);

  // 親番の ID / 名称で絞り込み
  const filteredParents = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return parentRows;
    return parentRows.filter(
      (p) =>
        p.display.toLowerCase().includes(q) || p.name.toLowerCase().includes(q),
    );
  }, [parentRows, filter]);

  const areaRowsOf = (parentId: string): AreaRow[] => {
    if (!tree) return [];
    const rows = (tree.areasByParent.get(parentId) ?? []).map((ar) => ({
      areaId: ar.id,
      displayName: tree.displayIndex.get(ar.id) ?? ar.id,
      hasPolygon: ar.polygonIds.length > 0,
      checkout: checkoutByArea.get(ar.id) ?? null,
    }));
    rows.sort((x, y) => x.displayName.localeCompare(y.displayName));
    return rows;
  };

  /** 回収（強制回収）: 確認ダイアログを挟んで ForceReturn。仕様 wants/10「区域一覧 /areas」 */
  const handleCollect = async (row: AreaRow) => {
    if (!row.checkout) return;
    if (!window.confirm(a.confirmCollect)) return;
    try {
      await services.checkoutService.forceReturn(
        currentActorID,
        row.checkout.checkoutId,
      );
      setReloadTick((tick) => tick + 1);
    } catch (e) {
      window.alert(String(e));
    }
  };

  const toggleExpanded = (parentId: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(parentId)) {
        next.delete(parentId);
      } else {
        next.add(parentId);
      }
      return next;
    });
  };

  return (
    <>
      <h1>{a.title}</h1>

      <div className="areas-filter-row">
        <input
          type="search"
          className="areas-filter-input"
          aria-label={a.filterPlaceholder}
          placeholder={a.filterPlaceholder}
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
      </div>

      {loading ? (
        <p className="areas-empty">{a.loading}</p>
      ) : parentRows.length === 0 ? (
        <p className="areas-empty">{a.empty}</p>
      ) : filteredParents.length === 0 ? (
        <p className="areas-empty">{a.noMatch}</p>
      ) : (
        <table className="areas-table">
          <thead>
            <tr>
              <th className="areas-col-toggle" aria-hidden="true"></th>
              <th>{a.colParent}</th>
              <th>{a.colName}</th>
              <th>{a.colAreaCount}</th>
            </tr>
          </thead>
          <tbody>
            {filteredParents.map((p) => {
              const isOpen = expanded.has(p.id);
              return [
                <tr
                  key={p.id}
                  className="areas-parent-row"
                  onClick={() => toggleExpanded(p.id)}
                >
                  <td className="areas-col-toggle">
                    <button
                      type="button"
                      className="areas-toggle-btn"
                      aria-expanded={isOpen}
                      aria-label={isOpen ? a.collapseRow : a.expandRow}
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleExpanded(p.id);
                      }}
                    >
                      {isOpen ? "▾" : "▸"}
                    </button>
                  </td>
                  <td className="areas-cell-id">{p.display}</td>
                  <td>{p.name}</td>
                  <td>{p.areaCount}</td>
                </tr>,
                isOpen && (
                  <tr key={`${p.id}-detail`} className="areas-detail-row">
                    <td colSpan={4}>
                      {areaRowsOf(p.id).length === 0 ? (
                        <p className="areas-empty">{a.noAreas}</p>
                      ) : (
                        <table className="areas-subtable">
                          <thead>
                            <tr>
                              <th>{a.colArea}</th>
                              <th>{a.colCheckout}</th>
                              <th>{a.colActions}</th>
                            </tr>
                          </thead>
                          <tbody>
                            {areaRowsOf(p.id).map((row) => {
                              const co = row.checkout;
                              return (
                                <tr key={row.areaId}>
                                  <td className="areas-cell-id">
                                    {row.displayName}
                                  </td>
                                  <td>
                                    {co ? (
                                      a.checkoutInfo({
                                        name: co.ownerName,
                                        date: co.date,
                                      })
                                    ) : row.hasPolygon ? (
                                      a.notCheckedOut
                                    ) : (
                                      <span className="areas-no-polygon">
                                        {a.noPolygon}
                                      </span>
                                    )}
                                  </td>
                                  <td className="areas-cell-actions">
                                    {!co && row.hasPolygon && (
                                      <button
                                        type="button"
                                        className="btn btn-primary btn-sm"
                                        onClick={() =>
                                          setAssignTarget({
                                            areaId: row.areaId,
                                            displayName: row.displayName,
                                          })
                                        }
                                      >
                                        {a.checkoutAction}
                                      </button>
                                    )}
                                    {co && (
                                      <>
                                        <button
                                          type="button"
                                          className="btn btn-sm"
                                          onClick={() =>
                                            setInviteTarget({
                                              checkoutId: co.checkoutId,
                                              ownerId: co.ownerId,
                                              displayName: row.displayName,
                                            })
                                          }
                                        >
                                          {a.inviteAction}
                                        </button>
                                        <button
                                          type="button"
                                          className="btn btn-sm"
                                          onClick={() =>
                                            void handleCollect(row)
                                          }
                                        >
                                          {a.collectAction}
                                        </button>
                                      </>
                                    )}
                                    <button
                                      type="button"
                                      className="btn btn-sm"
                                      onClick={() =>
                                        navigate(`/visits/${row.areaId}`)
                                      }
                                    >
                                      {a.gotoVisit}
                                    </button>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      )}
                    </td>
                  </tr>
                ),
              ];
            })}
          </tbody>
        </table>
      )}

      {assignTarget && (
        <AssignCheckoutDialog
          areaId={assignTarget.areaId}
          areaDisplay={assignTarget.displayName}
          users={users}
          actorId={currentActorID}
          onClose={() => setAssignTarget(null)}
          onAssigned={() => {
            setAssignTarget(null);
            setReloadTick((tick) => tick + 1);
          }}
        />
      )}

      {inviteTarget && (
        <InviteDialog
          checkoutId={inviteTarget.checkoutId}
          ownerId={inviteTarget.ownerId}
          areaDisplay={inviteTarget.displayName}
          actorId={currentActorID}
          onClose={() => setInviteTarget(null)}
          onIssued={() => {}}
          onError={(msg) => window.alert(msg)}
        />
      )}
    </>
  );
}

interface AssignDialogProps {
  areaId: string;
  areaDisplay: string;
  users: User[];
  actorId: string;
  onClose: () => void;
  onAssigned: () => void;
}

/**
 * チェックアウト割り当てダイアログ。区域は行から固定、担当者のみ選ぶ
 * （クイック候補「自分」＋メンバー選択。仕様 wants/10「区域一覧 /areas」）。
 */
function AssignCheckoutDialog({
  areaId,
  areaDisplay,
  users,
  actorId,
  onClose,
  onAssigned,
}: AssignDialogProps) {
  const { t } = useI18n();
  const a = t.areas;
  const { checkoutService } = useServices();
  const [ownerId, setOwnerId] = useState<string>(actorId);
  const [submitting, setSubmitting] = useState(false);

  const handleAssign = async () => {
    if (!ownerId) return;
    setSubmitting(true);
    try {
      await checkoutService.checkout(actorId, areaId, ownerId);
      onAssigned();
    } catch (e) {
      window.alert(String(e));
      setSubmitting(false);
    }
  };

  return (
    <div className="checkouts-dialog-backdrop" onClick={onClose}>
      <div
        className="checkouts-dialog"
        role="dialog"
        aria-label={a.dlgTitle}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="checkouts-dialog-title">{a.dlgTitle}</div>
        <div className="checkouts-dialog-row">
          <div className="checkouts-dialog-label">{a.dlgArea}</div>
          <div className="checkouts-dialog-control">
            <span className="areas-cell-id">{areaDisplay}</span>
          </div>
        </div>
        <div className="checkouts-dialog-row">
          <div className="checkouts-dialog-label">{a.dlgOwner}</div>
          <div className="checkouts-dialog-control">
            <button
              type="button"
              className={`btn btn-sm ${ownerId === actorId ? "btn-primary" : ""}`}
              onClick={() => setOwnerId(actorId)}
            >
              {a.selfQuick}
            </button>
            <select
              value={ownerId}
              onChange={(e) => setOwnerId(e.target.value)}
              aria-label={a.dlgOwner}
            >
              <option value="">{a.dlgSelectOwner}</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name} ({t.users.roles[u.role]})
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="checkouts-dialog-actions">
          <button type="button" className="btn" onClick={onClose}>
            {a.dlgCancel}
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => void handleAssign()}
            disabled={!ownerId || submitting}
          >
            {a.dlgAssign}
          </button>
        </div>
      </div>
    </div>
  );
}
