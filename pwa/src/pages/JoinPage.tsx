// グループ招待の取り込み画面（`#/join?i=...`）。
// 招待 URL を OS カメラアプリ/ブラウザで開くと表示される。被招待者は自分の ID を
// 保ったまま（別 DID として）グループに参加する。デバイスペアリング（同一 DID）とは別物。
// 仕様: docs/wants/04_メンバー管理と権限.md「グループ招待（URL / QR による参加）」

import { useState } from "react";
import { useGroupNetwork } from "../contexts/GroupNetworkContext";
import { useI18n } from "../contexts/I18nContext";
import { useIdentity } from "../contexts/IdentityContext";

interface JoinPageProps {
  /** 参加完了/中止後にアプリ（または ID 作成）へ遷移させる。 */
  onConsumed: () => void;
}

export function JoinPage({ onConsumed }: JoinPageProps) {
  const { t } = useI18n();
  const m = t.join;
  const { hasIdentity } = useIdentity();
  const groupNetwork = useGroupNetwork();

  const [displayName, setDisplayName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const handleJoin = async () => {
    if (!groupNetwork || !displayName.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await groupNetwork.join(window.location.hash, displayName.trim());
      if (res.ok || res.code === "already_member") {
        setDone(true);
      } else {
        setError(res.code === "invite_expired" ? m.errorExpired : m.errorRejected);
      }
    } catch (e) {
      const code = (e as { code?: string }).code;
      if (code === "invite_expired") setError(m.errorExpired);
      else if (code === "unreachable") setError(m.errorUnreachable);
      else if (code === "invite_invalid") setError(m.errorRejected);
      else setError(m.errorGeneric);
      setBusy(false);
    }
  };

  return (
    <div className="onboarding">
      <div className="onboarding-card">
        <h1 className="onboarding-title">{m.title}</h1>
        <p className="onboarding-subtitle">{m.subtitle}</p>

        {done ? (
          <>
            <p className="onboarding-hint">{m.success}</p>
            <div className="onboarding-actions">
              <button
                type="button"
                className="btn btn-primary"
                onClick={onConsumed}
              >
                {m.toApp}
              </button>
            </div>
          </>
        ) : !hasIdentity ? (
          <>
            <p className="onboarding-hint">{m.needIdentity}</p>
            <div className="onboarding-actions">
              <button
                type="button"
                className="btn btn-primary"
                onClick={onConsumed}
              >
                {m.toOnboarding}
              </button>
            </div>
          </>
        ) : !groupNetwork ? (
          <p className="onboarding-error">{t.groupInvite.unavailable}</p>
        ) : (
          <div className="onboarding-form">
            <label className="onboarding-label" htmlFor="join-name">
              {m.displayNameLabel}
            </label>
            <input
              id="join-name"
              className="onboarding-input"
              value={displayName}
              placeholder={m.displayNamePlaceholder}
              autoFocus
              onChange={(e) => setDisplayName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void handleJoin();
              }}
            />
            {error && <p className="onboarding-error">{error}</p>}
            <div className="onboarding-actions">
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => void handleJoin()}
                disabled={!displayName.trim() || busy}
              >
                {busy ? m.joining : m.submit}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
