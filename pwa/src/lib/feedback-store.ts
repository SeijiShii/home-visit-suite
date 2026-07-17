// 開発者宛フィードバックのローカル保存（docs/wants/07「フィードバック」）。
// - 送信スレッド: 自分が開発者へ送ったフィードバックと受信した返信
// - 開発者受信ボックス: 開発者 DID の端末が受信したフィードバック
// どちらも localStorage 保存。兄弟端末とは「ストア文書」（自己 DID 宛の封緘
// deposit。lib/linkself/feedback-mailbox.ts）の union 統合で同期する
// （docs/wants/07「兄弟端末への同期」）。
// 重い LinkSelf 依存を持たない軽量モジュールで、受信処理（feedback-mailbox）と
// 画面（FeedbackPage）が共用する。

import type { FeedbackKind } from "../domain/models/feedback";

/** 送信スレッド／受信ボックスが更新されたことを画面へ知らせる window イベント。 */
export const FEEDBACK_UPDATED_EVENT = "hvs:feedback-updated";

const THREADS_KEY = "hvs.devFeedbackThreads";
const INBOX_KEY = "hvs.devFeedbackInbox";

/** 開発者からの返信 1 件。envelopeId で重複取り込みを防ぐ。 */
export interface DeveloperFeedbackReply {
  envelopeId: string;
  body: string;
  /** ISO 8601 */
  sentAt: string;
}

/** 開発者宛に送った 1 件のフィードバックとその返信スレッド。 */
export interface DeveloperFeedbackThread {
  feedbackId: string;
  kind: FeedbackKind;
  body: string;
  /** ISO 8601 */
  sentAt: string;
  replies: DeveloperFeedbackReply[];
}

/** 開発者受信ボックスの 1 件。 */
export interface DeveloperInboxItem {
  envelopeId: string;
  feedbackId: string;
  kind: FeedbackKind;
  body: string;
  senderDID: string;
  senderName: string;
  /** ISO 8601（送信側申告） */
  sentAt: string;
  /** ISO 8601（この端末で取り込んだ時刻） */
  receivedAt: string;
  /** ISO 8601（返信済みのとき） */
  repliedAt: string | null;
}

function load<T>(key: string): T[] {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T[]) : [];
  } catch {
    return [];
  }
}

function store(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // storage が使えない環境では保持しない（表示のみ揮発）
  }
}

/** 送信スレッド一覧（新しい順）。 */
export function listFeedbackThreads(): DeveloperFeedbackThread[] {
  return load<DeveloperFeedbackThread>(THREADS_KEY).sort((a, b) =>
    b.sentAt.localeCompare(a.sentAt),
  );
}

/** 送信直後のフィードバックをスレッドとして記録する。 */
export function addSentFeedbackThread(
  t: Omit<DeveloperFeedbackThread, "replies">,
): void {
  const threads = load<DeveloperFeedbackThread>(THREADS_KEY);
  if (threads.some((x) => x.feedbackId === t.feedbackId)) return;
  threads.push({ ...t, replies: [] });
  store(THREADS_KEY, threads);
}

/**
 * 受信した返信をスレッドへ取り込む。取り込んだら true。
 * - envelopeId 重複（ack はストア文書 deposit 後のため再取得があり得る）は捨てる
 * - 該当スレッドが無い返信は取り込まない（スレッドはストア文書の統合で先に
 *   届く前提。文書が失効していた場合も封筒は非 ack で残り、スレッドを持つ
 *   端末が後で取り込める）
 */
export function addFeedbackReplyIfNew(
  feedbackId: string,
  reply: DeveloperFeedbackReply,
): boolean {
  const threads = load<DeveloperFeedbackThread>(THREADS_KEY);
  const thread = threads.find((t) => t.feedbackId === feedbackId);
  if (!thread) return false;
  if (thread.replies.some((r) => r.envelopeId === reply.envelopeId)) {
    return false;
  }
  thread.replies.push(reply);
  thread.replies.sort((a, b) => a.sentAt.localeCompare(b.sentAt));
  store(THREADS_KEY, threads);
  return true;
}

/** 開発者受信ボックス一覧（新しい順）。 */
export function listDeveloperInbox(): DeveloperInboxItem[] {
  return load<DeveloperInboxItem>(INBOX_KEY).sort((a, b) =>
    b.sentAt.localeCompare(a.sentAt),
  );
}

/** 受信フィードバックを取り込む（envelopeId 重複は捨てる）。取り込んだら true。 */
export function addDeveloperInboxItemIfNew(item: DeveloperInboxItem): boolean {
  const inbox = load<DeveloperInboxItem>(INBOX_KEY);
  if (inbox.some((x) => x.envelopeId === item.envelopeId)) return false;
  inbox.push(item);
  store(INBOX_KEY, inbox);
  return true;
}

/** 返信送信済みを記録する。 */
export function markDeveloperInboxReplied(
  feedbackId: string,
  at: string,
): void {
  const inbox = load<DeveloperInboxItem>(INBOX_KEY);
  const item = inbox.find((x) => x.feedbackId === feedbackId);
  if (!item) return;
  item.repliedAt = at;
  store(INBOX_KEY, inbox);
}

/** 更新イベントを発火する（開いている画面が再読込する）。 */
export function notifyFeedbackUpdated(): void {
  try {
    globalThis.dispatchEvent?.(new CustomEvent(FEEDBACK_UPDATED_EVENT));
  } catch {
    // 非ブラウザ環境（テスト等）では通知なしでよい
  }
}

// --- 兄弟端末同期（フィードバックストア文書。docs/wants/07「兄弟端末への同期」） ---

/** ストア文書に載せるスナップショット（送信スレッド＋開発者受信ボックス）。 */
export interface FeedbackStoreSnapshot {
  threads: DeveloperFeedbackThread[];
  inbox: DeveloperInboxItem[];
}

/** 現在のローカルストア全体（文書 deposit の元ネタ）。 */
export function loadFeedbackStoreSnapshot(): FeedbackStoreSnapshot {
  return {
    threads: load<DeveloperFeedbackThread>(THREADS_KEY),
    inbox: load<DeveloperInboxItem>(INBOX_KEY),
  };
}

/** 返信が既にローカルに取り込まれているか（ack 可否の判定に使う）。 */
export function hasFeedbackReply(
  feedbackId: string,
  envelopeId: string,
): boolean {
  return load<DeveloperFeedbackThread>(THREADS_KEY).some(
    (t) =>
      t.feedbackId === feedbackId &&
      t.replies.some((r) => r.envelopeId === envelopeId),
  );
}

/** 受信フィードバックが既にローカルに取り込まれているか（ack 可否の判定に使う）。 */
export function hasDeveloperInboxItem(envelopeId: string): boolean {
  return load<DeveloperInboxItem>(INBOX_KEY).some(
    (x) => x.envelopeId === envelopeId,
  );
}

/**
 * 兄弟端末のストア文書を union 統合する（スレッド=feedbackId・返信/受信=
 * envelopeId で重複排除。repliedAt は非 null を優先）。変化があれば true。
 */
export function mergeFeedbackStoreSnapshot(
  incoming: FeedbackStoreSnapshot,
): boolean {
  let changed = false;

  const threads = load<DeveloperFeedbackThread>(THREADS_KEY);
  for (const inc of incoming.threads ?? []) {
    if (!inc?.feedbackId) continue;
    const mine = threads.find((t) => t.feedbackId === inc.feedbackId);
    if (!mine) {
      threads.push({
        feedbackId: inc.feedbackId,
        kind: inc.kind ?? "other",
        body: inc.body ?? "",
        sentAt: inc.sentAt ?? "",
        replies: [...(inc.replies ?? [])],
      });
      changed = true;
      continue;
    }
    for (const rep of inc.replies ?? []) {
      if (!rep?.envelopeId) continue;
      if (mine.replies.some((r) => r.envelopeId === rep.envelopeId)) continue;
      mine.replies.push(rep);
      mine.replies.sort((a, b) => a.sentAt.localeCompare(b.sentAt));
      changed = true;
    }
  }

  const inbox = load<DeveloperInboxItem>(INBOX_KEY);
  for (const inc of incoming.inbox ?? []) {
    if (!inc?.envelopeId) continue;
    const mine = inbox.find((x) => x.envelopeId === inc.envelopeId);
    if (!mine) {
      inbox.push({ ...inc });
      changed = true;
      continue;
    }
    if (mine.repliedAt == null && inc.repliedAt != null) {
      mine.repliedAt = inc.repliedAt;
      changed = true;
    }
  }

  if (changed) {
    store(THREADS_KEY, threads);
    store(INBOX_KEY, inbox);
  }
  return changed;
}
