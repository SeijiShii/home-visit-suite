// グループ招待の取り込み画面（`#/join?i=...`）。
// 招待 URL を OS カメラアプリ/ブラウザで開くと表示される。被招待者は自分の ID を
// 保ったまま（別 DID として）グループに参加する。デバイスペアリング（同一 DID）とは別物。
// ID 未作成の端末では同じフォームから「ID を作成して参加」で一気に完了する:
// 表示名で ID を作成（role=member）→ 参加名を sessionStorage に控えて再読込
// （招待ハッシュは URL に残る）→ 実 identity で LinkSelf が配線された後、自動で
// 参加を続行する。参加成立時は招待ロールを adoptRole で採用する。
// 管理者に到達できないときは非同期参加（メールボックスに預ける）へフォールバック
// する。承認は招待発行時に済んでおり、管理者側アプリがオンラインになれば自動で
// 成立する（追加承認なし）。待機中はタブを閉じてよく、結果は次回起動時
// （または待機中の定期確認）に反映される。成立時のロール採用は App が担う。
// 仕様: docs/wants/04_メンバー管理と権限.md「グループ招待（URL / QR による参加）」

import { decodeInvite, extractInviteParam } from "@linkself/core";
import { useEffect, useRef, useState } from "react";
import type { Role } from "../domain/models/user";
import { AppBrand } from "../components/AppBrand";
import { useGroupNetwork } from "../contexts/GroupNetworkContext";
import { useI18n } from "../contexts/I18nContext";
import { useIdentity } from "../contexts/IdentityContext";
import { setGroupName } from "../lib/group-name";
import { extractGroupNameParam } from "../lib/linkself/group-invite";
import {
  ASYNC_JOIN_EVENT,
  type AsyncJoinResult,
} from "../lib/linkself/group-network";

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
  // 非同期参加の成立待ち（deposit 済み。管理者側アプリのオンライン化で自動成立）。
  const [waiting, setWaiting] = useState(false);
  const autoJoinTried = useRef(false);

  // 招待 URL の表示用グループ名（&g=、署名対象外）。無ければ null（旧招待）。
  const [inviteGroupName] = useState<string | null>(() =>
    extractGroupNameParam(window.location.hash),
  );
  // 招待に含まれるロール（表示用。署名検証は参加時に行う）。
  const [inviteRole] = useState<string | null>(() => {
    try {
      return decodeInvite(extractInviteParam(window.location.hash)).role;
    } catch {
      return null;
    }
  });

  /** 参加が成立した（または預けた）グループの表示名をこの端末に保存する。 */
  const persistGroupName = () => {
    if (inviteGroupName) setGroupName(inviteGroupName);
  };

  // 確認待ちの復元: deposit 済みのままこの画面に戻ってきたら待機表示にする。
  useEffect(() => {
    if (groupNetwork?.getPendingJoin() != null) {
      setWaiting(true);
    }
  }, [groupNetwork]);

  // 待機中に受理結果が届いたら表示を確定する（ロール採用は App が担う）。
  useEffect(() => {
    const onDecision = (e: Event) => {
      const result = (e as CustomEvent<AsyncJoinResult>).detail;
      setWaiting(false);
      setBusy(false);
      if (result.ok) {
        setDone(true);
      } else {
        setError(
          result.code === "invite_expired" ? m.errorExpired : m.errorRejected,
        );
      }
    };
    window.addEventListener(ASYNC_JOIN_EVENT, onDecision);
    return () => window.removeEventListener(ASYNC_JOIN_EVENT, onDecision);
  }, [m]);

  /** 管理者に直接届かないとき: メールボックスに預けて成立待ちへ。 */
  const fallbackToAsync = async (name: string) => {
    if (!groupNetwork) return false;
    try {
      await groupNetwork.joinAsync(window.location.hash, name);
      // 成立結果を JoinPage 外（App）で受ける場合に備え、預けた時点で保存する。
      persistGroupName();
      setWaiting(true);
      setBusy(false);
      return true;
    } catch (e) {
      console.error("async join deposit failed:", e);
      return false;
    }
  };

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
        persistGroupName();
        setDone(true);
      } else if (res.code === "already_member") {
        persistGroupName();
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
      if (code === "unreachable") {
        // 管理者オフライン: 非同期参加（確認待ち）へフォールバック。
        if (await fallbackToAsync(name.trim())) return;
        setError(m.errorUnreachable);
      } else if (code === "invite_expired") setError(m.errorExpired);
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
        <AppBrand />
        <h1 className="onboarding-title">{m.title}</h1>
        <p className="onboarding-subtitle">
          {inviteGroupName ? m.invitedTo(inviteGroupName) : m.subtitle}
        </p>
        {inviteRole && !done && !waiting && (
          <p className="onboarding-hint">
            {m.joinRole(
              inviteRole === "admin" ||
                inviteRole === "editor" ||
                inviteRole === "member"
                ? t.users.roles[inviteRole]
                : inviteRole,
            )}
          </p>
        )}

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
        ) : waiting ? (
          <>
            <p className="onboarding-hint">{m.waitingTitle}</p>
            <p className="onboarding-hint">{m.waitingHint}</p>
            <div className="onboarding-actions">
              <button type="button" className="btn" onClick={onConsumed}>
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
