// フィードバック /feedback。仕様 docs/wants/07_通知と申請.md「フィードバック」:
// - 送信フォーム（全員）: 宛先=グループ管理者（feedback 同期テーブル）／開発者
//   （封緘メールボックス deposit）× 種別=バグ報告/応援/その他
// - 送信履歴（全員）: 管理者宛=同期テーブルの自分の送信分、開発者宛=ローカル
//   スレッド（返信併記）
// - 受信一覧（管理者のみ）: 全メンバーの管理者宛フィードバック＋ステータス管理
// - 開発者受信ボックス: ログイン DID が VITE_DEVELOPER_DID と一致するときのみ。
//   受信一覧と返信（送信者 DID 宛の封緘 deposit）
// LinkSelf 依存（libp2p・封緘）は送受信の操作時に動的 import する（バンドル節約）。

import { useCallback, useEffect, useMemo, useState } from "react";
import { useI18n } from "../contexts/I18nContext";
import { isRoleAtLeast, useIdentity } from "../contexts/IdentityContext";
import { useGroupNetwork } from "../contexts/GroupNetworkContext";
import { useServices } from "../contexts/ServicesContext";
import type {
  Feedback,
  FeedbackKind,
  FeedbackStatus,
} from "../domain/models/feedback";
import { useSharedApplied } from "../hooks/useSharedApplied";
import {
  FEEDBACK_UPDATED_EVENT,
  listDeveloperInbox,
  listFeedbackThreads,
  type DeveloperFeedbackThread,
  type DeveloperInboxItem,
} from "../lib/feedback-store";
import { parseRelays } from "../lib/linkself/relays";
import { newId } from "../services/id";
import { loadStoredSeed } from "../services/identity-service";

const KINDS: readonly FeedbackKind[] = ["bug_report", "encouragement", "other"];

type Destination = "admin" | "developer";

/** ビルド時設定の開発者 DID（未設定なら開発者宛は出さない）。 */
const DEVELOPER_DID: string | null =
  (import.meta.env.VITE_DEVELOPER_DID as string | undefined)?.trim() || null;

function formatDate(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())}`;
}

/** メールボックス経路の設定を解決する（開発者宛の送受信に使う）。 */
function mailboxConfig() {
  const mailboxes = parseRelays(
    import.meta.env.VITE_LINKSELF_RELAYS as string | undefined,
  );
  const seed = loadStoredSeed();
  if (mailboxes.length === 0 || !seed) return null;
  return { mailboxes, seed };
}

/** 開発者宛チャネル（識別・封緘・接続）を動的 import で組み立てる。 */
async function openDeveloperChannel() {
  const cfg = mailboxConfig();
  if (!cfg) throw new Error("developer channel unavailable");
  const [{ linkselfIdentityFromSeed }, mailbox] = await Promise.all([
    import("../lib/linkself/identity-bridge"),
    import("../lib/linkself/feedback-mailbox"),
  ]);
  const identity = await linkselfIdentityFromSeed(cfg.seed);
  const allowLocalDial = ["1", "true", "on"].includes(
    String(import.meta.env.VITE_LINKSELF_ALLOW_LOCAL_DIAL ?? "").toLowerCase(),
  );
  return {
    channel: { identity, mailboxes: cfg.mailboxes, allowLocalDial },
    mailbox,
  };
}

export function FeedbackPage() {
  const { t } = useI18n();
  const f = t.feedback;
  const services = useServices();
  const groupNetwork = useGroupNetwork();
  const { currentActorID, currentName, currentRole } = useIdentity();
  const isAdmin = isRoleAtLeast(currentRole, "admin");

  // 宛先の可用性。管理者宛: ネットワーク配線時はグループ所属が条件
  // （スタンドアロン/開発モードはローカルグループとして常に可）。
  // 開発者宛: DID 設定 + メールボックス到達設定 + 実 identity が条件。
  const adminAvailable =
    groupNetwork == null || groupNetwork.getNetworkId() != null;
  const developerAvailable = DEVELOPER_DID != null && mailboxConfig() != null;
  const selfIsDeveloper =
    DEVELOPER_DID != null && currentActorID === DEVELOPER_DID;

  const anyDestination = adminAvailable || developerAvailable;
  const [destination, setDestination] = useState<Destination>(
    adminAvailable ? "admin" : "developer",
  );
  const [kind, setKind] = useState<FeedbackKind>("bug_report");
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [sendMessage, setSendMessage] = useState<string | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);

  // 管理者宛（同期テーブル）: 自分の送信分と（管理者なら）全受信分
  const [rows, setRows] = useState<Feedback[] | null>(null);
  const [userNames, setUserNames] = useState<Map<string, string>>(new Map());
  // 開発者宛（ローカル保存）
  const [threads, setThreads] = useState<DeveloperFeedbackThread[]>([]);
  const [inbox, setInbox] = useState<DeveloperInboxItem[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState<string | null>(null);
  // 開発者の返信フォーム（開いている項目の feedbackId と入力値）
  const [replyOpen, setReplyOpen] = useState<string | null>(null);
  const [replyBody, setReplyBody] = useState("");
  const [replySending, setReplySending] = useState(false);
  const [replyError, setReplyError] = useState<string | null>(null);

  const reload = useCallback(() => {
    void (async () => {
      try {
        const [feedback, users] = await Promise.all([
          services.notificationRepo.listFeedback(),
          services.userRepo.listUsers(),
        ]);
        setRows(
          [...feedback].sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
        );
        setUserNames(new Map(users.map((u) => [u.id, u.name])));
      } catch (e) {
        console.error("[FeedbackPage] load failed", e);
        setRows([]);
      }
    })();
  }, [services]);

  const reloadLocal = useCallback(() => {
    setThreads(listFeedbackThreads());
    setInbox(listDeveloperInbox());
  }, []);

  useEffect(() => {
    reload();
    reloadLocal();
  }, [reload, reloadLocal]);

  // 受信同期の自動反映（feedback 行と送信者名の元データ）
  useSharedApplied(["feedback", "users"], reload);

  // 返信・受信ボックスのローカル更新イベント
  useEffect(() => {
    window.addEventListener(FEEDBACK_UPDATED_EVENT, reloadLocal);
    return () =>
      window.removeEventListener(FEEDBACK_UPDATED_EVENT, reloadLocal);
  }, [reloadLocal]);

  // 画面表示時にメールボックスを同期する（docs/wants/07「双方向」。
  // 返信の受信と、開発者端末なら受信フィードバックの取り込み）。
  const syncMailbox = useCallback(async () => {
    if (!developerAvailable) return;
    const { channel, mailbox } = await openDeveloperChannel();
    await mailbox.syncFeedbackMailbox(channel, DEVELOPER_DID);
  }, [developerAvailable]);

  useEffect(() => {
    syncMailbox().catch((e) =>
      console.warn("[FeedbackPage] mailbox sync failed", e),
    );
  }, [syncMailbox]);

  const kindLabel = (k: FeedbackKind): string => {
    switch (k) {
      case "bug_report":
        return f.kinds.bugReport;
      case "encouragement":
        return f.kinds.encouragement;
      case "other":
        return f.kinds.other;
    }
  };

  const send = async () => {
    const text = body.trim();
    if (!text || sending) return;
    setSending(true);
    setSendMessage(null);
    setSendError(null);
    try {
      if (destination === "admin") {
        await services.notificationRepo.saveFeedback({
          id: newId("feedback"),
          kind,
          body: text,
          senderId: currentActorID,
          createdAt: new Date().toISOString(),
          status: "pending",
          resolvedAt: null,
          resolvedBy: "",
        });
        reload();
        setSendMessage(f.sentAdmin);
      } else {
        const { channel, mailbox } = await openDeveloperChannel();
        // スレッド記録・ストア文書の預け直し・更新イベントは send 側が行う
        await mailbox.sendFeedbackToDeveloper(channel, DEVELOPER_DID!, {
          kind,
          body: text,
          senderName: currentName,
        });
        setSendMessage(f.sentDeveloper);
      }
      setBody("");
    } catch (e) {
      console.error("[FeedbackPage] send failed", e);
      setSendError(f.sendFailed);
    } finally {
      setSending(false);
    }
  };

  const changeStatus = async (row: Feedback, status: FeedbackStatus) => {
    try {
      await services.notificationRepo.saveFeedback({
        ...row,
        status,
        resolvedAt: status === "resolved" ? new Date().toISOString() : null,
        resolvedBy: status === "resolved" ? currentActorID : "",
      });
    } catch (e) {
      console.error("[FeedbackPage] saveFeedback failed", e);
    }
    reload();
  };

  const refreshInbox = async () => {
    if (refreshing) return;
    setRefreshing(true);
    setRefreshError(null);
    try {
      await syncMailbox();
      reloadLocal();
    } catch (e) {
      console.error("[FeedbackPage] refresh failed", e);
      setRefreshError(f.refreshFailed);
    } finally {
      setRefreshing(false);
    }
  };

  const sendReply = async (item: DeveloperInboxItem) => {
    const text = replyBody.trim();
    if (!text || replySending) return;
    setReplySending(true);
    setReplyError(null);
    try {
      const { channel, mailbox } = await openDeveloperChannel();
      await mailbox.sendFeedbackReply(channel, item.senderDID, {
        feedbackId: item.feedbackId,
        body: text,
      });
      setReplyOpen(null);
      setReplyBody("");
      reloadLocal();
    } catch (e) {
      console.error("[FeedbackPage] reply failed", e);
      setReplyError(f.replyFailed);
    } finally {
      setReplySending(false);
    }
  };

  // 送信履歴: 管理者宛（同期テーブルの自分の分）と開発者宛（ローカルスレッド）を
  // 送信日の降順で 1 本に統合する。
  const history = useMemo(() => {
    const adminSent = (rows ?? [])
      .filter((r) => r.senderId === currentActorID)
      .map((r) => ({
        key: `admin:${r.id}`,
        destination: "admin" as Destination,
        kind: r.kind,
        body: r.body,
        sentAt: r.createdAt,
        replies: [] as DeveloperFeedbackThread["replies"],
      }));
    const devSent = threads.map((th) => ({
      key: `dev:${th.feedbackId}`,
      destination: "developer" as Destination,
      kind: th.kind,
      body: th.body,
      sentAt: th.sentAt,
      replies: th.replies,
    }));
    return [...adminSent, ...devSent].sort((a, b) =>
      b.sentAt.localeCompare(a.sentAt),
    );
  }, [rows, threads, currentActorID]);

  const canSend =
    body.trim() !== "" &&
    !sending &&
    (destination === "admin" ? adminAvailable : developerAvailable);

  return (
    <>
      <h1>{f.title}</h1>

      <section className="settings-section feedback-send">
        <h2>{f.sendSection}</h2>
        <p className="settings-section-description">{f.sendDescription}</p>
        {!anyDestination && (
          <p className="settings-section-note">{f.noDestinationNote}</p>
        )}
        {anyDestination && (
          <>
            <div className="settings-field">
              <label className="settings-field-label" htmlFor="feedback-dest">
                {f.destinationLabel}
              </label>
              <select
                id="feedback-dest"
                className="settings-select"
                value={destination}
                onChange={(e) => setDestination(e.target.value as Destination)}
              >
                {adminAvailable && (
                  <option value="admin">{f.destinationAdmin}</option>
                )}
                {developerAvailable && (
                  <option value="developer">{f.destinationDeveloper}</option>
                )}
              </select>
            </div>
            <div className="settings-field">
              <label className="settings-field-label" htmlFor="feedback-kind">
                {f.kindLabel}
              </label>
              <select
                id="feedback-kind"
                className="settings-select"
                value={kind}
                onChange={(e) => setKind(e.target.value as FeedbackKind)}
              >
                {KINDS.map((k) => (
                  <option key={k} value={k}>
                    {kindLabel(k)}
                  </option>
                ))}
              </select>
            </div>
            <div className="settings-field feedback-body-field">
              <label className="settings-field-label" htmlFor="feedback-body">
                {f.bodyLabel}
              </label>
              <textarea
                id="feedback-body"
                className="settings-input feedback-body-input"
                rows={4}
                maxLength={4000}
                placeholder={f.bodyPlaceholder}
                value={body}
                onChange={(e) => setBody(e.target.value)}
              />
            </div>
            <div className="settings-field-actions">
              <button
                type="button"
                className="btn btn-primary"
                disabled={!canSend}
                onClick={() => void send()}
              >
                {sending ? f.sending : f.send}
              </button>
            </div>
            {destination === "developer" && developerAvailable && (
              <p className="settings-section-note">{f.ttlNote}</p>
            )}
            {sendMessage && <p className="settings-msg">{sendMessage}</p>}
            {sendError && <p className="feedback-error">{sendError}</p>}
          </>
        )}
      </section>

      <section className="settings-section">
        <h2>{f.historySection}</h2>
        {rows === null ? (
          <p className="requests-empty">{f.historyLoading}</p>
        ) : history.length === 0 ? (
          <p className="requests-empty">{f.historyEmpty}</p>
        ) : (
          <ul className="requests-list" role="list">
            {history.map((h) => (
              <li key={h.key} className="requests-row">
                <div className="requests-row-head">
                  <span className="requests-type">{kindLabel(h.kind)}</span>
                  <span className="feedback-destination">
                    {h.destination === "admin"
                      ? f.destinationAdmin
                      : f.destinationDeveloper}
                  </span>
                  <span className="requests-date">{formatDate(h.sentAt)}</span>
                </div>
                {h.body && <p className="requests-description">{h.body}</p>}
                {h.replies.map((rep) => (
                  <div key={rep.envelopeId} className="feedback-reply">
                    <span className="feedback-reply-label">
                      {f.replyFrom} {formatDate(rep.sentAt)}
                    </span>
                    <p className="requests-description">{rep.body}</p>
                  </div>
                ))}
              </li>
            ))}
          </ul>
        )}
      </section>

      {isAdmin && (
        <section className="settings-section">
          <h2>{f.inboxSection}</h2>
          {rows === null ? (
            <p className="requests-empty">{f.historyLoading}</p>
          ) : rows.length === 0 ? (
            <p className="requests-empty">{f.inboxEmpty}</p>
          ) : (
            <ul className="requests-list" role="list">
              {rows.map((row) => (
                <li key={row.id} className="requests-row">
                  <div className="requests-row-head">
                    <span className="requests-type">{kindLabel(row.kind)}</span>
                    <span className="requests-submitter">
                      {userNames.get(row.senderId) ?? row.senderId}
                    </span>
                    <span className="requests-date">
                      {formatDate(row.createdAt)}
                    </span>
                    <span
                      className={`requests-status-badge requests-status-${row.status}`}
                    >
                      {row.status === "pending"
                        ? f.statusPending
                        : f.statusResolved}
                    </span>
                  </div>
                  <p className="requests-description">{row.body}</p>
                  <div className="requests-row-footer">
                    {row.resolvedAt && (
                      <span className="requests-resolved-at">
                        {formatDate(row.resolvedAt)}
                      </span>
                    )}
                    <div className="requests-row-actions">
                      <button
                        type="button"
                        className="btn btn-sm"
                        onClick={() =>
                          void changeStatus(
                            row,
                            row.status === "pending" ? "resolved" : "pending",
                          )
                        }
                      >
                        {row.status === "pending"
                          ? f.setResolved
                          : f.setPending}
                      </button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {selfIsDeveloper && (
        <section className="settings-section">
          <h2>{f.devInboxSection}</h2>
          <div className="settings-field-actions">
            <button
              type="button"
              className="btn"
              disabled={refreshing}
              onClick={() => void refreshInbox()}
            >
              {refreshing ? f.refreshing : f.refresh}
            </button>
          </div>
          {refreshError && <p className="feedback-error">{refreshError}</p>}
          {inbox.length === 0 ? (
            <p className="requests-empty">{f.devInboxEmpty}</p>
          ) : (
            <ul className="requests-list" role="list">
              {inbox.map((item) => (
                <li key={item.envelopeId} className="requests-row">
                  <div className="requests-row-head">
                    <span className="requests-type">
                      {kindLabel(item.kind)}
                    </span>
                    <span className="requests-submitter">
                      {item.senderName || item.senderDID}
                    </span>
                    <span className="requests-date">
                      {formatDate(item.sentAt)}
                    </span>
                    {item.repliedAt && (
                      <span className="requests-status-badge requests-status-resolved">
                        {f.replied}
                      </span>
                    )}
                  </div>
                  <p className="requests-description">{item.body}</p>
                  <div className="requests-row-footer">
                    <div className="requests-row-actions">
                      <button
                        type="button"
                        className="btn btn-sm"
                        onClick={() => {
                          setReplyOpen(
                            replyOpen === item.feedbackId
                              ? null
                              : item.feedbackId,
                          );
                          setReplyBody("");
                          setReplyError(null);
                        }}
                      >
                        {f.reply}
                      </button>
                    </div>
                  </div>
                  {replyOpen === item.feedbackId && (
                    <div className="feedback-reply-form">
                      <textarea
                        className="settings-input feedback-body-input"
                        rows={3}
                        maxLength={4000}
                        placeholder={f.replyPlaceholder}
                        value={replyBody}
                        onChange={(e) => setReplyBody(e.target.value)}
                      />
                      <div className="settings-field-actions">
                        <button
                          type="button"
                          className="btn btn-primary btn-sm"
                          disabled={replyBody.trim() === "" || replySending}
                          onClick={() => void sendReply(item)}
                        >
                          {replySending ? f.replySending : f.replySend}
                        </button>
                      </div>
                      {replyError && (
                        <p className="feedback-error">{replyError}</p>
                      )}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </>
  );
}
