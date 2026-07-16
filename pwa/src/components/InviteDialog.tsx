// desktop/frontend/src/components/InviteDialog.tsx からの移植。
// Wails CheckoutBinding / UserBinding 依存を useServices() に置き換えた。
// 2026-07-16: チェックアウト管理 /checkouts の廃止に伴い「招待管理ダイアログ」化。
// 既発行招待の一覧・取消と新規発行を 1 つのダイアログで担う。

import { useCallback, useEffect, useMemo, useState } from "react";
import { useI18n } from "../contexts/I18nContext";
import { useServices } from "../contexts/ServicesContext";
import type { CheckoutInvitation } from "../domain/models/checkout-invitation";
import type { Tag, User } from "../domain/models/user";

/** 招待管理ダイアログのプロパティ */
export interface InviteDialogProps {
  /** 対象チェックアウト ID */
  checkoutId: string;
  /** 担当者の DID（被招待者候補から除外する） */
  ownerId: string;
  /** 区域表示名（例: "NRT-001-01"）。ダイアログヘッダに表示 */
  areaDisplay: string;
  /** API 呼び出し時の actor DID */
  actorId: string;
  onClose: () => void;
  /** 招待発行成功時のコールバック（ダイアログは閉じず一覧を更新する） */
  onIssued: (inv: CheckoutInvitation) => void;
  onError: (msg: string) => void;
}

/** TTL 選択肢の有効値（時間） */
const TTL_HOURS_VALUES = [6, 12, 24, 48] as const;
type TtlHours = (typeof TTL_HOURS_VALUES)[number];

/**
 * 招待管理ダイアログ。
 * 仕様 docs/wants/05_チェックアウト.md「区域招待 > 招待 UI」:
 *   - アクセス経路は 2 つ: 担当者本人のダッシュボード「招待」／editor+ の区域一覧 `/areas`「招待」
 *   - 既発行の招待一覧（被招待者名・残り時間・状態）と取消（招待者本人／現担当者／editor+）
 *   - 新規発行: 候補リスト = 同一グループ内の活動メンバー全員（担当者本人を除く）、
 *     メンバータグフィルタ + インクリメンタルサーチ、有効期限プルダウン（既定 24 時間）
 *   - 同一被招待者への重複招待は expiresAt 上書き延長（サービス側で対応済み）
 */
export function InviteDialog({
  checkoutId,
  ownerId,
  areaDisplay,
  actorId,
  onClose,
  onIssued,
  onError,
}: InviteDialogProps) {
  const { t } = useI18n();
  const { userRepo, checkoutService } = useServices();
  const c = t.invite;
  const [users, setUsers] = useState<User[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [invitations, setInvitations] = useState<CheckoutInvitation[]>([]);
  const [tagFilter, setTagFilter] = useState<string>("");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [selectedInviteeId, setSelectedInviteeId] = useState<string>("");
  const [ttlHours, setTtlHours] = useState<TtlHours>(24);
  const [submitting, setSubmitting] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const reloadInvitations = useCallback(async () => {
    try {
      setInvitations(await checkoutService.listInvitations(checkoutId));
    } catch (e) {
      console.error("listInvitations failed", e);
    }
  }, [checkoutService, checkoutId]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const [allUsers, allTags] = await Promise.all([
          userRepo.listUsers(),
          userRepo.listTags(),
        ]);
        if (cancelled) return;
        setUsers(allUsers);
        setTags(allTags);
      } catch (e) {
        if (!cancelled) {
          setLoadError(String(e));
        }
      }
    }
    void load();
    void reloadInvitations();
    return () => {
      cancelled = true;
    };
  }, [userRepo, reloadInvitations]);

  /**
   * 被招待者候補:
   *   - 活動メンバー (role === "member") のみ
   *   - 担当者本人（ownerId）を除外
   *   - メンバータグフィルタ適用（指定タグを持つメンバー）
   *   - インクリメンタルサーチ適用（氏名の小文字部分一致）
   */
  const candidates = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return users
      .filter((u) => u.role === "member")
      .filter((u) => u.id !== ownerId)
      .filter((u) => !tagFilter || u.tagIds.includes(tagFilter))
      .filter((u) => !q || u.name.toLowerCase().includes(q));
  }, [users, ownerId, tagFilter, searchQuery]);

  const handleIssue = async () => {
    if (!selectedInviteeId) return;
    setSubmitting(true);
    try {
      const inv = await checkoutService.invite(
        actorId,
        checkoutId,
        selectedInviteeId,
        ttlHours * 60 * 60 * 1000,
      );
      setSelectedInviteeId("");
      await reloadInvitations();
      onIssued(inv);
    } catch (e) {
      onError(String(e));
    } finally {
      setSubmitting(false);
    }
  };

  const handleRevoke = async (inv: CheckoutInvitation) => {
    try {
      await checkoutService.revokeInvite(actorId, inv.id);
      await reloadInvitations();
    } catch (e) {
      onError(String(e));
    }
  };

  const userName = (id: string): string =>
    users.find((u) => u.id === id)?.name ?? id;

  /** 招待の状態表示: 有効なら残り時間、期限切れ／取消済みはその旨 */
  const invitationStatus = (
    inv: CheckoutInvitation,
  ): { label: string; active: boolean } => {
    if (inv.revokedAt !== null) return { label: c.revoked, active: false };
    const remainingMs = new Date(inv.expiresAt).getTime() - Date.now();
    if (remainingMs <= 0) return { label: c.expired, active: false };
    const hours = Math.max(1, Math.floor(remainingMs / (1000 * 60 * 60)));
    return { label: c.remainingHours(hours), active: true };
  };

  const ttlLabel = (hours: TtlHours): string => {
    switch (hours) {
      case 6:
        return c.ttl6h;
      case 12:
        return c.ttl12h;
      case 24:
        return c.ttl24h;
      case 48:
        return c.ttl48h;
    }
  };

  return (
    <div className="checkouts-dialog-backdrop" onClick={onClose}>
      <div
        className="invite-dialog"
        role="dialog"
        aria-label={c.dlgTitle}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="invite-dialog-title">{c.dlgTitle}</div>
        <div className="invite-dialog-subtitle">{c.dlgFor(areaDisplay)}</div>

        <div className="invite-dialog-section-title">{c.listHeader}</div>
        {invitations.length === 0 ? (
          <div className="invite-dialog-list-empty">{c.listEmpty}</div>
        ) : (
          <div className="invite-dialog-invitations">
            {invitations.map((inv) => {
              const status = invitationStatus(inv);
              return (
                <div className="invite-dialog-invitation-row" key={inv.id}>
                  <div
                    className={
                      status.active
                        ? undefined
                        : "invite-dialog-invitation-inactive"
                    }
                  >
                    <span className="invite-dialog-invitation-name">
                      {userName(inv.inviteeId)}
                    </span>
                    <span className="invite-dialog-invitation-meta">
                      {status.label}
                    </span>
                  </div>
                  {status.active && (
                    <button
                      type="button"
                      className="btn btn-sm"
                      onClick={() => void handleRevoke(inv)}
                    >
                      {c.revoke}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}

        <div className="invite-dialog-section-title">{c.newHeader}</div>
        <div className="invite-dialog-filters">
          <select
            className="invite-dialog-filter-select"
            aria-label={c.groupFilter}
            value={tagFilter}
            onChange={(e) => setTagFilter(e.target.value)}
          >
            <option value="">{c.groupAll}</option>
            {tags.map((tg) => (
              <option key={tg.id} value={tg.id}>
                {tg.name}
              </option>
            ))}
          </select>
          <input
            type="search"
            className="invite-dialog-filter-input"
            placeholder={c.search}
            aria-label={c.search}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        <div className="invite-dialog-list" role="listbox">
          {loadError ? (
            <div className="invite-dialog-list-empty">{loadError}</div>
          ) : candidates.length === 0 ? (
            <div className="invite-dialog-list-empty">{c.noCandidates}</div>
          ) : (
            candidates.map((u) => {
              const checked = selectedInviteeId === u.id;
              return (
                <label
                  key={u.id}
                  className={`invite-dialog-item ${
                    checked ? "invite-dialog-item-checked" : ""
                  }`}
                  role="option"
                  aria-selected={checked}
                >
                  <input
                    type="radio"
                    name="invitee"
                    value={u.id}
                    checked={checked}
                    onChange={() => setSelectedInviteeId(u.id)}
                  />
                  <span className="invite-dialog-item-name">{u.name}</span>
                  <span className="invite-dialog-item-meta">
                    {u.tagIds
                      .map((id) => tags.find((tg) => tg.id === id)?.name ?? id)
                      .join(", ")}
                  </span>
                </label>
              );
            })
          )}
        </div>

        <div className="invite-dialog-ttl-row">
          <label htmlFor="invite-dlg-ttl" className="invite-dialog-ttl-label">
            {c.ttl}
          </label>
          <select
            id="invite-dlg-ttl"
            className="invite-dialog-ttl-select"
            value={ttlHours}
            onChange={(e) => setTtlHours(Number(e.target.value) as TtlHours)}
          >
            {TTL_HOURS_VALUES.map((h) => (
              <option key={h} value={h}>
                {ttlLabel(h)}
              </option>
            ))}
          </select>
        </div>

        <div className="invite-dialog-actions">
          <button type="button" className="btn" onClick={onClose}>
            {c.close}
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => void handleIssue()}
            disabled={!selectedInviteeId || submitting}
          >
            {c.issue}
          </button>
        </div>
      </div>
    </div>
  );
}
