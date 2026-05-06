import { useEffect, useMemo, useState } from "react";
import { useI18n } from "../contexts/I18nContext";
import * as CheckoutBinding from "../../wailsjs/go/binding/CheckoutBinding";
import * as UserBinding from "../../wailsjs/go/binding/UserBinding";
import { models } from "../../wailsjs/go/models";

/** 招待発行ダイアログのプロパティ */
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
  /** 招待発行成功時のコールバック */
  onIssued: (inv: models.CheckoutInvitation) => void;
  onError: (msg: string) => void;
}

/** TTL 選択肢の有効値 */
const TTL_HOURS_VALUES = [6, 12, 24, 48] as const;
type TtlHours = (typeof TTL_HOURS_VALUES)[number];

/**
 * 区域招待発行ダイアログ。
 * 仕様 docs/wants/05_チェックアウト.md「区域招待 > 招待 UI」:
 *   - 既定の候補リスト: 同一 LinkSelf グループ内の活動メンバー全員（担当者本人を除く）
 *   - メンバータグフィルタ + インクリメンタルサーチ（OrgGroup 廃止後のフィルタ手段）
 *   - 有効期限プルダウン（既定 24 時間）
 *   - 同一被招待者への重複招待は ExpiresAt 上書き延長（サービス側で対応済み）
 *   - 編集メンバー以上は被招待者にできない（活動メンバー member のみ）
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
  const c = t.checkouts;
  const [users, setUsers] = useState<models.User[]>([]);
  const [tags, setTags] = useState<models.Tag[]>([]);
  const [tagFilter, setTagFilter] = useState<string>("");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [selectedInviteeId, setSelectedInviteeId] = useState<string>("");
  const [ttlHours, setTtlHours] = useState<TtlHours>(24);
  const [submitting, setSubmitting] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const [allUsers, allTags] = await Promise.all([
          UserBinding.ListUsers(),
          UserBinding.ListTags(),
        ]);
        if (cancelled) return;
        setUsers(allUsers ?? []);
        setTags(allTags ?? []);
      } catch (e) {
        if (!cancelled) {
          setLoadError(String(e));
        }
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

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
      .filter((u) => !tagFilter || (u.tagIds ?? []).includes(tagFilter))
      .filter((u) => !q || u.name.toLowerCase().includes(q));
  }, [users, ownerId, tagFilter, searchQuery]);

  const handleIssue = async () => {
    if (!selectedInviteeId) return;
    setSubmitting(true);
    try {
      const inv = await CheckoutBinding.Invite(
        actorId,
        checkoutId,
        selectedInviteeId,
        ttlHours,
      );
      onIssued(inv);
    } catch (e) {
      onError(String(e));
      setSubmitting(false);
    }
  };

  const ttlLabel = (hours: TtlHours): string => {
    switch (hours) {
      case 6:
        return c.inviteDlgTtl6h;
      case 12:
        return c.inviteDlgTtl12h;
      case 24:
        return c.inviteDlgTtl24h;
      case 48:
        return c.inviteDlgTtl48h;
    }
  };

  return (
    <div className="checkouts-dialog-backdrop" onClick={onClose}>
      <div
        className="invite-dialog"
        role="dialog"
        aria-label={c.inviteDlgTitle}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="invite-dialog-title">{c.inviteDlgTitle}</div>
        <div className="invite-dialog-subtitle">
          {c.inviteDlgFor(areaDisplay)}
        </div>

        <div className="invite-dialog-filters">
          <select
            className="invite-dialog-filter-select"
            aria-label={c.inviteDlgGroupFilter}
            value={tagFilter}
            onChange={(e) => setTagFilter(e.target.value)}
          >
            <option value="">{c.inviteDlgGroupAll}</option>
            {tags.map((tg) => (
              <option key={tg.id} value={tg.id}>
                {tg.name}
              </option>
            ))}
          </select>
          <input
            type="search"
            className="invite-dialog-filter-input"
            placeholder={c.inviteDlgSearch}
            aria-label={c.inviteDlgSearch}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        <div className="invite-dialog-list" role="listbox">
          {loadError ? (
            <div className="invite-dialog-list-empty">{loadError}</div>
          ) : candidates.length === 0 ? (
            <div className="invite-dialog-list-empty">
              {c.inviteDlgNoCandidates}
            </div>
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
                    {(u.tagIds ?? [])
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
            {c.inviteDlgTtl}
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
            {c.inviteDlgCancel}
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => void handleIssue()}
            disabled={!selectedInviteeId || submitting}
          >
            {c.inviteDlgIssue}
          </button>
        </div>
      </div>
    </div>
  );
}
