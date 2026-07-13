// グループ招待の取り込み画面（`#/join?i=...`）。
// 招待 URL を OS カメラアプリ/ブラウザで開くと表示される。被招待者は自分の ID を
// 保ったまま（別 DID として）グループに参加する。デバイスペアリング（同一 DID）とは別物。
// ID 未作成の端末では同じフォームから「ID を作成して参加」で一気に完了する:
// 表示名で ID を作成（role=member）→ 参加名を sessionStorage に控えて再読込
// （招待ハッシュは URL に残る）→ 実 identity で LinkSelf が配線された後、自動で
// 参加を続行する。参加成立時は招待ロールを adoptRole で採用する。
// 仕様: docs/wants/04_メンバー管理と権限.md「グループ招待（URL / QR による参加）」

import { useEffect, useRef, useState } from "react";
import type { Role } from "../domain/models/user";
import { useGroupNetwork } from "../contexts/GroupNetworkContext";
import { useI18n } from "../contexts/I18nContext";
import { useIdentity } from "../contexts/IdentityContext";

/** ID 作成→再読込をまたいで参加を自動継続するための表示名の一時置き場。 */
const PENDING_JOIN_KEY = "hvs.pendingJoinName";

interface JoinPageProps {
  /** 参加完了/中止後にアプリへ遷移させる。 */
  onConsumed: () => void;
}

export function JoinPage({ onConsumed }: JoinPageProps) {
  const { t } = useI18n();
  const m = t.join;
  const { hasIdentity, createIdentity, adoptRole } = useIdentity();
  const groupNetwork = useGroupNetwork();

  const [displayName, setDisplayName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const autoJoinTried = useRef(false);

  const handleJoin = async (name: string) => {
    if (!groupNetwork || !name.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await groupNetwork.join(window.location.hash, name.trim());
      if (res.ok) {
        // 招待ロールを自分のロールとして採用する（未知値は member 扱い）。
        const joined = res.network.memberRoles[groupNetwork.selfDID];
        const role: Role =
          joined === "admin" || joined === "editor" ? joined : "member";
        await adoptRole(role);
        setDone(true);
      } else if (res.code === "already_member") {
        setDone(true);
      } else {
        setError(
          res.code === "invite_expired" ? m.errorExpired : m.errorRejected,
        );
        setBusy(false);
      }
    } catch (e) {
      // 原因調査用（unreachable は全リレー到達失敗の最後のエラーを含む）。
      console.error("join failed:", e);
      const code = (e as { code?: string }).code;
      if (code === "invite_expired") setError(m.errorExpired);
      else if (code === "unreachable") setError(m.errorUnreachable);
      else if (code === "invite_invalid") setError(m.errorRejected);
      else setError(m.errorGeneric);
      setBusy(false);
    }
  };

  /** ID 未作成端末: 表示名で ID を作成し、参加を予約して再読込する。 */
  const handleCreateAndJoin = async () => {
    const name = displayName.trim();
    if (!name || busy) return;
    setBusy(true);
    setError(null);
    try {
      await createIdentity(name, "member");
      sessionStorage.setItem(PENDING_JOIN_KEY, name);
      // 実 identity での LinkSelf 配線は bootstrap（main.tsx）で行うため再読込する。
      // 招待ハッシュ（#/join?i=...）は URL に残るのでこの画面に戻ってくる。
      window.location.reload();
    } catch {
      setError(m.errorGeneric);
      setBusy(false);
    }
  };

  // ID 作成→再読込後の自動継続。配線が整った初回のみ実行する。
  useEffect(() => {
    if (autoJoinTried.current || !hasIdentity || !groupNetwork) return;
    const pending = sessionStorage.getItem(PENDING_JOIN_KEY);
    if (!pending) return;
    autoJoinTried.current = true;
    sessionStorage.removeItem(PENDING_JOIN_KEY);
    setDisplayName(pending);
    void handleJoin(pending);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasIdentity, groupNetwork]);

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
        ) : hasIdentity && !groupNetwork ? (
          <p className="onboarding-error">{t.groupInvite.unavailable}</p>
        ) : (
          <div className="onboarding-form">
            {!hasIdentity && <p className="onboarding-hint">{m.createHint}</p>}
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
                if (e.key === "Enter") {
                  void (hasIdentity
                    ? handleJoin(displayName)
                    : handleCreateAndJoin());
                }
              }}
            />
            {error && <p className="onboarding-error">{error}</p>}
            <div className="onboarding-actions">
              <button
                type="button"
                className="btn btn-primary"
                onClick={() =>
                  void (hasIdentity
                    ? handleJoin(displayName)
                    : handleCreateAndJoin())
                }
                disabled={!displayName.trim() || busy}
              >
                {busy ? m.joining : hasIdentity ? m.submit : m.createAndJoin}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
