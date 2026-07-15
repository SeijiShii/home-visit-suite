// グループ招待の発行 UI（管理者専用）。
// 他ユーザーを招待する 3 日期限の URL / QR を発行する。デバイスペアリング（同一 DID）
// とは別物で、別ユーザー（別 DID）を選択したロール（既定: 活動メンバー）でグループへ
// 迎える。URL には表示用グループ名を同梱する（docs/wants/04「グループ名」）。
// 仕様: docs/wants/04_メンバー管理と権限.md「グループ招待（URL / QR による参加）」

import { useRef, useState } from "react";
import { useGroupNetwork } from "../contexts/GroupNetworkContext";
import { useI18n } from "../contexts/I18nContext";
import { useIdentity } from "../contexts/IdentityContext";
import type { Role } from "../domain/models/user";
import { getGroupName } from "../lib/group-name";
import { QrCode } from "./QrCode";

/** 招待で指定できるロール（docs/wants/04「グループ招待」。既定は活動メンバー）。 */
const INVITE_ROLES: Role[] = ["member", "editor", "admin"];

/** 残り時間を「N日 Nh」程度の粗い表記にする（3 日トークン向け・秒刻み不要）。 */
function formatRemaining(ms: number): string {
  const totalMin = Math.max(0, Math.floor(ms / 60_000));
  const days = Math.floor(totalMin / (60 * 24));
  const hours = Math.floor((totalMin % (60 * 24)) / 60);
  const mins = totalMin % 60;
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
}

export function GroupInviteSection() {
  const { t } = useI18n();
  const m = t.groupInvite;
  const { currentRole } = useIdentity();
  const groupNetwork = useGroupNetwork();

  const [url, setUrl] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState<number>(0);
  const [issuing, setIssuing] = useState(false);
  const [err, setErr] = useState<string>("");
  const [copied, setCopied] = useState(false);
  const [role, setRole] = useState<Role>("member");
  const urlRef = useRef<HTMLInputElement>(null);

  // グループ招待は管理者専用（docs/wants/04）。
  if (currentRole !== "admin") return null;

  const handleIssue = async () => {
    if (!groupNetwork || issuing) return;
    setIssuing(true);
    setErr("");
    try {
      const issued = await groupNetwork.issueInvite({
        role,
        groupName: getGroupName() ?? undefined,
      });
      setUrl(issued.url);
      setExpiresAt(issued.expiresAt);
    } catch (e) {
      const code = (e as { code?: string }).code;
      setErr(code === "no_relay_address" ? m.errorNoRelay : m.errorGeneric);
    } finally {
      setIssuing(false);
    }
  };

  const handleCopy = async () => {
    if (!url) return;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url);
      } else {
        const el = urlRef.current;
        if (el) {
          el.select();
          document.execCommand("copy");
        }
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (e) {
      console.error("copy failed", e);
    }
  };

  return (
    <section className="settings-section">
      <h2>{m.section}</h2>
      <p className="settings-section-description">{m.description}</p>

      {!groupNetwork ? (
        <p className="settings-section-note">{m.unavailable}</p>
      ) : (
        <>
          <div className="settings-field">
            <label className="settings-field-label" htmlFor="group-invite-role">
              {m.roleLabel}
            </label>
            <select
              id="group-invite-role"
              className="settings-select"
              value={role}
              onChange={(e) => setRole(e.target.value as Role)}
            >
              {INVITE_ROLES.map((r) => (
                <option key={r} value={r}>
                  {t.users.roles[r]}
                </option>
              ))}
            </select>
          </div>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => void handleIssue()}
            disabled={issuing}
          >
            {issuing ? m.issuing : m.issue}
          </button>
          {err && <p className="onboarding-error">{err}</p>}
        </>
      )}

      {url && (
        <div className="modal-overlay" onClick={() => setUrl(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3 className="modal-title">{m.dialogTitle}</h3>
            <p className="settings-section-description">{m.dialogHint}</p>
            <p className="settings-section-note">
              {m.dialogRole(t.users.roles[role])}
            </p>
            <div className="device-pairing-qr">
              {/* ペアリング QR と同様、密度対策で大きめに描画する。 */}
              <QrCode text={url} size={300} />
            </div>
            <div className="device-pairing-url-row">
              <input
                ref={urlRef}
                className="device-pairing-url"
                value={url}
                readOnly
                onFocus={(e) => e.currentTarget.select()}
              />
              <button
                type="button"
                className="btn btn-sm"
                onClick={() => void handleCopy()}
              >
                {copied ? m.copied : m.copyUrl}
              </button>
            </div>
            <p className="device-pairing-note">
              {m.expiresIn(formatRemaining(expiresAt - Date.now()))}
            </p>
            <div className="modal-actions">
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => setUrl(null)}
              >
                {m.close}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
