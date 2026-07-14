// desktop/frontend/src/pages/CheckoutsPage.tsx からの移植。
// Wails Binding 依存を useServices() に置き換えた。
// - CheckoutBinding → checkoutService / checkoutRepo
// - RegionBinding → regionRepo
// - UserBinding → userRepo
// - VisitBinding.ListVisitRecords → checkoutRepo.listVisitRecords

import { useCallback, useEffect, useMemo, useState } from "react";
import { InviteDialog } from "../components/InviteDialog";
import { useI18n } from "../contexts/I18nContext";
import { useIdentity } from "../contexts/IdentityContext";
import { type AppServices, useServices } from "../contexts/ServicesContext";
import type { CheckoutInvitation } from "../domain/models/checkout-invitation";
import { areaPolygonIds } from "../domain/models/region";
import type { User } from "../domain/models/user";

type StatusTab = "active" | "returned" | "complete";

interface CheckoutRow {
  id: string;
  areaId: string;
  areaDisplay: string;
  personInChargeId: string;
  personInChargeName: string;
  checkedOutById: string;
  checkedOutByName: string;
  status: string;
  createdAt: string;
  returnedAt: string | null;
  completedAt: string | null;
}

interface RegionTreeMaps {
  /** areaId → "NRT-001-01" 表示名 */
  displayIndex: Map<string, string>;
  /** 全区域メタ情報（チェックアウト発行ダイアログの選択肢用） */
  allAreas: { id: string; displayName: string; hasPolygon: boolean }[];
}

async function buildRegionMaps(
  regionRepo: AppServices["regionRepo"],
): Promise<RegionTreeMaps> {
  const displayIndex = new Map<string, string>();
  const allAreas: RegionTreeMaps["allAreas"] = [];
  const regions = await regionRepo.listRegions();
  for (const r of regions) {
    const pas = await regionRepo.listParentAreas(r.id);
    for (const pa of pas) {
      const areas = await regionRepo.listAreas(pa.id);
      for (const a of areas) {
        const display = `${r.symbol}-${pa.number}-${a.number}`;
        displayIndex.set(a.id, display);
        allAreas.push({
          id: a.id,
          displayName: display,
          hasPolygon: areaPolygonIds(a).length > 0,
        });
      }
    }
  }
  allAreas.sort((x, y) => x.displayName.localeCompare(y.displayName));
  return { displayIndex, allAreas };
}

function statusToTab(status: string): StatusTab | null {
  if (status === "active" || status === "pending") return "active";
  if (status === "returned") return "returned";
  if (status === "complete") return "complete";
  return null;
}

/**
 * チェックアウト管理画面（編集メンバー以上専用、サイドバーから到達）。
 * 一覧・詳細・チェックアウト発行ダイアログ・基本アクション（返却 / 強制回収 / 担当者変更）を提供する。
 * 仕様 docs/wants/10_画面設計.md「3. チェックアウト管理」
 */
export function CheckoutsPage() {
  const { t } = useI18n();
  const { currentActorID } = useIdentity();
  const services = useServices();
  const c = t.checkouts;

  const [rows, setRows] = useState<CheckoutRow[]>([]);
  const [regionMaps, setRegionMaps] = useState<RegionTreeMaps>({
    displayIndex: new Map(),
    allAreas: [],
  });
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<StatusTab>("active");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [invitations, setInvitations] = useState<CheckoutInvitation[]>([]);
  const [visitRecordCount, setVisitRecordCount] = useState<number | null>(null);
  const [issueDialogOpen, setIssueDialogOpen] = useState(false);
  const [inviteDialogOpen, setInviteDialogOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /** 全データを再ロード */
  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const [maps, all, allUsers] = await Promise.all([
        buildRegionMaps(services.regionRepo),
        services.checkoutRepo.listAllCheckouts(),
        services.userRepo.listUsers(),
      ]);
      const userById = new Map<string, User>();
      for (const u of allUsers) userById.set(u.id, u);
      const composed: CheckoutRow[] = all.map((co) => {
        const pic = userById.get(co.personInChargeId);
        const checkedBy = co.checkedOutById
          ? userById.get(co.checkedOutById)
          : undefined;
        return {
          id: co.id,
          areaId: co.areaId,
          areaDisplay: maps.displayIndex.get(co.areaId) ?? co.areaId,
          personInChargeId: co.personInChargeId,
          personInChargeName: pic?.name ?? co.personInChargeId,
          checkedOutById: co.checkedOutById,
          checkedOutByName: checkedBy?.name ?? co.checkedOutById,
          status: co.status,
          createdAt: co.createdAt ?? "",
          returnedAt: co.returnedAt,
          completedAt: co.completedAt,
        };
      });
      composed.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      setRows(composed);
      setRegionMaps(maps);
      setUsers(allUsers);
    } catch (e) {
      console.error("CheckoutsPage reload failed", e);
      setError(`${c.errorGeneric}: ${String(e)}`);
    } finally {
      setLoading(false);
    }
  }, [c.errorGeneric, services]);

  useEffect(() => {
    void reload();
  }, [reload]);

  // 選択中のチェックアウト ID から詳細をロード（招待 + 訪問記録件数）
  useEffect(() => {
    if (!selectedId) {
      setInvitations([]);
      setVisitRecordCount(null);
      return;
    }
    const selected = rows.find((r) => r.id === selectedId);
    let cancelled = false;
    async function loadDetail() {
      try {
        const [invs, records] = await Promise.all([
          services.checkoutService.listInvitations(selectedId as string),
          selected
            ? services.checkoutRepo.listVisitRecords(selected.areaId)
            : Promise.resolve([]),
        ]);
        if (cancelled) return;
        setInvitations(invs);
        // 当該チェックアウト ID に紐づく訪問記録のみカウント
        const filtered = records.filter((r) => r.checkoutId === selectedId);
        setVisitRecordCount(filtered.length);
      } catch (e) {
        console.error("loadDetail failed", e);
      }
    }
    void loadDetail();
    return () => {
      cancelled = true;
    };
  }, [selectedId, rows, services]);

  const filteredRows = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return rows.filter((r) => {
      const tab = statusToTab(r.status);
      if (tab !== activeTab) return false;
      if (q) {
        const hay = `${r.areaDisplay} ${r.personInChargeName}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [rows, activeTab, searchQuery]);

  const selected = rows.find((r) => r.id === selectedId) ?? null;

  /** 返却（担当者または編集メンバー以上） */
  const handleReturn = useCallback(async () => {
    if (!selected) return;
    try {
      await services.checkoutService.return(currentActorID, selected.id);
      await reload();
    } catch (e) {
      setError(`${c.actionReturn}: ${String(e)}`);
    }
  }, [selected, currentActorID, reload, c.actionReturn, services]);

  /** 強制回収（editor+） */
  const handleForceReturn = useCallback(async () => {
    if (!selected) return;
    if (!window.confirm(c.confirmForceReturn)) return;
    try {
      await services.checkoutService.forceReturn(currentActorID, selected.id);
      await reload();
    } catch (e) {
      setError(`${c.actionForceReturn}: ${String(e)}`);
    }
  }, [
    selected,
    currentActorID,
    reload,
    c.confirmForceReturn,
    c.actionForceReturn,
    services,
  ]);

  /** 担当者変更（editor+） — 簡易プロンプトで DID を入力 */
  const handleReassign = useCallback(async () => {
    if (!selected) return;
    const newPiCID = window.prompt(
      c.confirmReassignPrompt,
      selected.personInChargeId,
    );
    if (!newPiCID || newPiCID === selected.personInChargeId) return;
    try {
      await services.checkoutService.reassignPersonInCharge(
        currentActorID,
        selected.id,
        newPiCID.trim(),
      );
      await reload();
    } catch (e) {
      setError(`${c.actionReassign}: ${String(e)}`);
    }
  }, [
    selected,
    currentActorID,
    reload,
    c.confirmReassignPrompt,
    c.actionReassign,
    services,
  ]);

  const handleInvite = useCallback(() => {
    if (!selected) return;
    setInviteDialogOpen(true);
  }, [selected]);

  const handleInviteIssued = useCallback(async () => {
    setInviteDialogOpen(false);
    // 招待リストを再ロード
    if (selectedId) {
      try {
        const invs = await services.checkoutService.listInvitations(selectedId);
        setInvitations(invs);
      } catch (e) {
        console.error("reload invitations failed", e);
      }
    }
  }, [selectedId, services]);

  const handleRevokeInvite = useCallback(
    async (inv: CheckoutInvitation) => {
      try {
        await services.checkoutService.revokeInvite(currentActorID, inv.id);
        // selectedId 経由で再ロード
        if (selectedId) {
          const invs =
            await services.checkoutService.listInvitations(selectedId);
          setInvitations(invs);
        }
      } catch (e) {
        setError(`${c.revokeInvite}: ${String(e)}`);
      }
    },
    [currentActorID, selectedId, c.revokeInvite, services],
  );

  return (
    <div className="checkouts-page">
      <h1>{c.title}</h1>

      {error && (
        <div className="checkouts-error" role="alert">
          {error}
        </div>
      )}

      <div className="checkouts-toolbar">
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => setIssueDialogOpen(true)}
        >
          {c.newCheckout}
        </button>
        <input
          type="search"
          className="checkouts-search"
          placeholder={c.searchPlaceholder}
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          aria-label={c.searchPlaceholder}
        />
      </div>

      <div className="checkouts-tabs" role="tablist">
        {(["active", "returned", "complete"] as StatusTab[]).map((tab) => (
          <button
            key={tab}
            type="button"
            role="tab"
            aria-selected={activeTab === tab}
            className={`checkouts-tab ${
              activeTab === tab ? "checkouts-tab-active" : ""
            }`}
            onClick={() => setActiveTab(tab)}
          >
            {tab === "active"
              ? c.tabActive
              : tab === "returned"
                ? c.tabReturned
                : c.tabCompleted}
          </button>
        ))}
      </div>

      <div className="checkouts-split">
        <div className="checkouts-list-panel" role="tabpanel">
          {loading ? (
            <div className="checkouts-list-empty">{c.searchPlaceholder}…</div>
          ) : filteredRows.length === 0 ? (
            <div className="checkouts-list-empty">{c.listEmpty}</div>
          ) : (
            filteredRows.map((row) => (
              <button
                key={row.id}
                type="button"
                className={`checkouts-list-item ${
                  selectedId === row.id ? "checkouts-list-item-active" : ""
                }`}
                onClick={() => setSelectedId(row.id)}
              >
                <div className="checkouts-list-item-area">
                  {row.areaDisplay}
                </div>
                <div className="checkouts-list-item-meta">
                  <span className="checkouts-list-item-owner">
                    {row.personInChargeName}
                  </span>
                  <span
                    className={`checkouts-list-item-status checkouts-status-${row.status}`}
                  >
                    {(c.status as Record<string, string>)[row.status] ??
                      row.status}
                  </span>
                </div>
              </button>
            ))
          )}
        </div>

        <div className="checkouts-detail-panel">
          {selected ? (
            <CheckoutDetail
              row={selected}
              invitations={invitations}
              visitRecordCount={visitRecordCount}
              onReturn={handleReturn}
              onForceReturn={handleForceReturn}
              onReassign={handleReassign}
              onInvite={handleInvite}
              onRevokeInvite={handleRevokeInvite}
              t={t}
            />
          ) : (
            <div className="checkouts-detail-empty">{c.selectPrompt}</div>
          )}
        </div>
      </div>

      {issueDialogOpen && (
        <IssueCheckoutDialog
          allAreas={regionMaps.allAreas}
          users={users}
          actorId={currentActorID}
          onClose={() => setIssueDialogOpen(false)}
          onIssued={async () => {
            setIssueDialogOpen(false);
            await reload();
          }}
          onError={(msg) => setError(msg)}
          t={t}
        />
      )}

      {inviteDialogOpen && selected && (
        <InviteDialog
          checkoutId={selected.id}
          ownerId={selected.personInChargeId}
          areaDisplay={selected.areaDisplay}
          actorId={currentActorID}
          onClose={() => setInviteDialogOpen(false)}
          onIssued={handleInviteIssued}
          onError={(msg) => setError(msg)}
        />
      )}
    </div>
  );
}

interface DetailProps {
  row: CheckoutRow;
  invitations: CheckoutInvitation[];
  visitRecordCount: number | null;
  onReturn: () => void;
  onForceReturn: () => void;
  onReassign: () => void;
  onInvite: () => void;
  onRevokeInvite: (inv: CheckoutInvitation) => void;
  t: ReturnType<typeof useI18n>["t"];
}

function CheckoutDetail({
  row,
  invitations,
  visitRecordCount,
  onReturn,
  onForceReturn,
  onReassign,
  onInvite,
  onRevokeInvite,
  t,
}: DetailProps) {
  const c = t.checkouts;
  const isActive = row.status === "active" || row.status === "pending";
  const showIssuer =
    row.checkedOutById !== "" && row.checkedOutById !== row.personInChargeId;
  const statusLabel =
    (c.status as Record<string, string>)[row.status] ?? row.status;

  const formatRemaining = (expiresAtIso: string): string => {
    const remainingMs = new Date(expiresAtIso).getTime() - Date.now();
    if (remainingMs <= 0) return c.inviteExpired;
    const hours = Math.max(1, Math.floor(remainingMs / (1000 * 60 * 60)));
    return c.inviteRemainingHours(hours);
  };

  return (
    <>
      <div className="checkouts-detail-row">
        <div className="checkouts-detail-label">{c.detailArea}</div>
        <div className="checkouts-detail-value checkouts-detail-value-mono">
          {row.areaDisplay}
        </div>
      </div>
      <div className="checkouts-detail-row">
        <div className="checkouts-detail-label">{c.detailOwner}</div>
        <div className="checkouts-detail-value">{row.personInChargeName}</div>
      </div>
      {showIssuer && (
        <div className="checkouts-detail-row">
          <div className="checkouts-detail-label">{c.detailLentBy}</div>
          <div className="checkouts-detail-value">{row.checkedOutByName}</div>
        </div>
      )}
      <div className="checkouts-detail-row">
        <div className="checkouts-detail-label">{c.detailStatus}</div>
        <div className="checkouts-detail-value">
          <span
            className={`checkouts-list-item-status checkouts-status-${row.status}`}
          >
            {statusLabel}
          </span>
        </div>
      </div>
      <div className="checkouts-detail-row">
        <div className="checkouts-detail-label">{c.detailStartedAt}</div>
        <div className="checkouts-detail-value">
          {formatDate(row.createdAt)}
        </div>
      </div>
      {row.returnedAt && (
        <div className="checkouts-detail-row">
          <div className="checkouts-detail-label">{c.detailReturnedAt}</div>
          <div className="checkouts-detail-value">
            {formatDate(row.returnedAt)}
          </div>
        </div>
      )}
      {row.completedAt && (
        <div className="checkouts-detail-row">
          <div className="checkouts-detail-label">{c.detailCompletedAt}</div>
          <div className="checkouts-detail-value">
            {formatDate(row.completedAt)}
          </div>
        </div>
      )}

      <div className="checkouts-detail-section">
        <div className="checkouts-detail-section-title">
          {c.visitRecordsHeader}
        </div>
        <div className="checkouts-detail-row">
          <div className="checkouts-detail-value">
            {visitRecordCount === null
              ? "…"
              : c.visitRecordsCount(visitRecordCount)}
          </div>
        </div>
      </div>

      <div className="checkouts-detail-section">
        <div className="checkouts-detail-section-title">
          {c.invitationsHeader}
        </div>
        {invitations.length === 0 ? (
          <div className="checkouts-detail-empty" style={{ padding: "8px 0" }}>
            {c.invitationsEmpty}
          </div>
        ) : (
          invitations.map((inv) => {
            const revoked = inv.revokedAt != null;
            return (
              <div className="checkouts-invitation-row" key={inv.id}>
                <div
                  className={
                    revoked ? "checkouts-invitation-revoked" : undefined
                  }
                >
                  <span className="checkouts-invitation-label">
                    {inv.inviteeId}
                  </span>
                  {!revoked && (
                    <span className="checkouts-invitation-meta">
                      {formatRemaining(inv.expiresAt)}
                    </span>
                  )}
                </div>
                {!revoked && isActive && (
                  <button
                    type="button"
                    className="btn btn-sm"
                    onClick={() => onRevokeInvite(inv)}
                  >
                    {c.revokeInvite}
                  </button>
                )}
              </div>
            );
          })
        )}
        {isActive && (
          <button
            type="button"
            className="btn btn-sm"
            onClick={onInvite}
            style={{ marginTop: 8 }}
          >
            {c.addInvite}
          </button>
        )}
      </div>

      {isActive && (
        <div className="checkouts-detail-actions">
          <button type="button" className="btn" onClick={onReturn}>
            {c.actionReturn}
          </button>
          <button type="button" className="btn" onClick={onForceReturn}>
            {c.actionForceReturn}
          </button>
          <button type="button" className="btn" onClick={onReassign}>
            {c.actionReassign}
          </button>
        </div>
      )}
    </>
  );
}

function formatDate(iso: string): string {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    return d.toLocaleString();
  } catch {
    return iso;
  }
}

interface IssueDialogProps {
  allAreas: { id: string; displayName: string; hasPolygon: boolean }[];
  users: User[];
  actorId: string;
  onClose: () => void;
  onIssued: () => void | Promise<void>;
  onError: (msg: string) => void;
  t: ReturnType<typeof useI18n>["t"];
}

function IssueCheckoutDialog({
  allAreas,
  users,
  actorId,
  onClose,
  onIssued,
  onError,
  t,
}: IssueDialogProps) {
  const { checkoutService } = useServices();
  const c = t.checkouts;
  const [areaId, setAreaId] = useState<string>("");
  const [ownerId, setOwnerId] = useState<string>(actorId);
  const [submitting, setSubmitting] = useState(false);

  const handleIssue = async () => {
    if (!areaId || !ownerId) return;
    setSubmitting(true);
    try {
      await checkoutService.checkout(actorId, areaId, ownerId);
      await onIssued();
    } catch (e) {
      onError(`${c.dlgIssue}: ${String(e)}`);
      setSubmitting(false);
    }
  };

  return (
    <div className="checkouts-dialog-backdrop" onClick={onClose}>
      <div
        className="checkouts-dialog"
        role="dialog"
        aria-label={c.dlgTitle}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="checkouts-dialog-title">{c.dlgTitle}</div>
        <div className="checkouts-dialog-row">
          <div className="checkouts-dialog-label">{c.dlgArea}</div>
          <div className="checkouts-dialog-control">
            <select
              value={areaId}
              onChange={(e) => setAreaId(e.target.value)}
              aria-label={c.dlgArea}
            >
              <option value="">{c.dlgSelectArea}</option>
              {allAreas.map((a) => (
                <option key={a.id} value={a.id} disabled={!a.hasPolygon}>
                  {a.hasPolygon
                    ? a.displayName
                    : `${a.displayName}${c.noPolygonSuffix}`}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="checkouts-dialog-row">
          <div className="checkouts-dialog-label">{c.dlgOwner}</div>
          <div className="checkouts-dialog-control">
            <button
              type="button"
              className={`btn btn-sm ${ownerId === actorId ? "btn-primary" : ""}`}
              onClick={() => setOwnerId(actorId)}
            >
              {c.selfQuick}
            </button>
            <select
              value={ownerId}
              onChange={(e) => setOwnerId(e.target.value)}
              aria-label={c.dlgOwner}
            >
              <option value="">{c.dlgSelectOwner}</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name} ({u.role})
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="checkouts-dialog-actions">
          <button type="button" className="btn" onClick={onClose}>
            {c.dlgCancel}
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => void handleIssue()}
            disabled={!areaId || !ownerId || submitting}
          >
            {c.dlgIssue}
          </button>
        </div>
      </div>
    </div>
  );
}
