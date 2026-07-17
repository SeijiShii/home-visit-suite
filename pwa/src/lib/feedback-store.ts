// 開発者宛フィードバックのローカル保存（docs/wants/07「フィードバック」）。
// - 送信スレッド: 自分が開発者へ送ったフィードバックと受信した返信（送信端末のみ・
//   v1 では端末間同期しない）
// - 開発者受信ボックス: 開発者 DID の端末が受信したフィードバック
// どちらも localStorage 保存。重い LinkSelf 依存を持たない軽量モジュールで、
// 受信処理（lib/linkself/feedback-mailbox.ts）と画面（FeedbackPage）が共用する。

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
 * - envelopeId 重複（封筒は ack せず TTL まで残るため再取得が常態）は捨てる
 * - 該当スレッドが無い返信は取り込まない（送信元でない兄弟端末のケース。
 *   封筒は残るので、スレッドを持つ送信元端末が後で取り込める）
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
