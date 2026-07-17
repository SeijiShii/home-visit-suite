// 開発者宛フィードバックの封緘送受信（docs/wants/07「フィードバック」）。
//
// グループのクローズド原則の例外チャネル: ユーザーが自分の意思で書いた本文と
// 送信者情報のみを、開発者 DID 宛に seal（E2E 封緘）して常時稼働ノードの
// メールボックスへ deposit する（非同期参加・ロスターメールボックスと同じ
// 既存機構の流用。常時稼働ノードは中身を読めない）。
// 返信は送信者のユーザー DID 宛に封緘 deposit され、ロスター同期と同じ
// 「読めない封筒は触らない」規約で共存する。
//
// 兄弟端末同期（docs/wants/07「兄弟端末への同期」）: ローカルストア
// （送信スレッド＋返信＋開発者受信ボックス）を 1 つの「ストア文書」として
// 自分のユーザー DID 宛に封緘 deposit し、兄弟端末が fetch → union 統合 →
// 預け直し（TTL 更新）する（ロスターメールボックスと同型）。
//
// ack の規約: 個別のフィードバック封筒（返信・受信フィードバック）は、その内容を
// 含んだストア文書の deposit が成功した後にのみ ack する（唯一写しを保存前に
// 消さない・全兄弟端末が文書経由で受け取れる状態にしてから消す）。旧ストア文書は
// 新しい統合文書の deposit 成功後に ack して整理する。
//
// 封緘は秘匿のみで送信者証明にならない（誰でも任意 DID 宛に seal できる）ため、
// ペイロードは送信者のユーザー鍵（Ed25519）で署名し、受信側は senderDID の
// 公開鍵で検証する（なりすまし・ストア汚染の防止）。

import {
  mailboxAck,
  mailboxDeposit,
  mailboxFetch,
  openSealed,
  parseToPublicKey,
  seal,
  type Identity,
  type KnownPeer,
  type MailboxTransport,
  type SealedBox,
} from "@linkself/core";
import type { FeedbackKind } from "../../domain/models/feedback";
import {
  addDeveloperInboxItemIfNew,
  addFeedbackReplyIfNew,
  addSentFeedbackThread,
  hasDeveloperInboxItem,
  hasFeedbackReply,
  loadFeedbackStoreSnapshot,
  markDeveloperInboxReplied,
  mergeFeedbackStoreSnapshot,
  notifyFeedbackUpdated,
  type FeedbackStoreSnapshot,
} from "../feedback-store";
import { withUserMailboxTransport } from "./user-mailbox";

/** 封筒 TTL。ノード既定の MaxTTL（14 日）に合わせる（超過分はノードが丸める）。 */
export const FEEDBACK_MAILBOX_TTL_MS = 14 * 24 * 60 * 60 * 1000;

/**
 * ストア文書（封緘前 JSON）のバイト上限。メールボックスノードは封筒 blob を
 * 64 KiB に制限する（link-self mailbox MaxBlobBytes）。seal + base64 で約 1.37 倍
 * になるため、封緘前 40 KiB なら余裕を持って収まる。ローカルストアが上限を超える
 * 場合は新しい順に刈り込んで文書化する（古い項目は同期済み端末のローカルにのみ残る。
 * docs/wants/07「送達の制約」）。
 */
export const FEEDBACK_STORE_DOC_MAX_BYTES = 40 * 1024;

/** フィードバック封筒のワイヤ種別。 */
export type FeedbackWireKind = "hvs-feedback" | "hvs-feedback-reply";

/** 封緘ペイロード（署名対象）。 */
export interface FeedbackWireMessage {
  v: 1;
  kind: FeedbackWireKind;
  feedbackId: string;
  /** フィードバック種別（hvs-feedback のみ） */
  type?: FeedbackKind;
  body: string;
  senderDID: string;
  /** 送信者表示名（hvs-feedback のみ） */
  senderName?: string;
  /** ISO 8601 */
  sentAt: string;
}

/** ワイヤ形式: 署名付きメッセージ（これを seal して deposit する）。 */
interface SignedFeedbackWire {
  msg: FeedbackWireMessage;
  /** base64(Ed25519 署名) */
  sig: string;
}

/** ストア文書（兄弟端末同期）。doc は JSON 文字列のまま署名・検証する。 */
interface SignedStoreDocWire {
  /** JSON.stringify(FeedbackStoreDoc)。この文字列のバイト列が署名対象。 */
  doc: string;
  /** base64(Ed25519 署名) */
  sig: string;
}

interface FeedbackStoreDoc {
  v: 1;
  kind: "hvs-feedback-store";
  senderDID: string;
  /** ISO 8601 */
  updatedAt: string;
  threads: FeedbackStoreSnapshot["threads"];
  inbox: FeedbackStoreSnapshot["inbox"];
}

/** 受信・検証済みのフィードバック封筒。 */
export interface ReceivedFeedbackMessage {
  envelopeId: string;
  depositedAt: number;
  msg: FeedbackWireMessage;
}

/** 受信・検証済みのストア文書封筒。 */
export interface ReceivedStoreDoc {
  envelopeId: string;
  depositedAt: number;
  snapshot: FeedbackStoreSnapshot;
}

/** メッセージ署名対象の正準バイト列（フィールド順固定。JSON キー順に依存しない）。 */
function canonicalBytes(msg: FeedbackWireMessage): Uint8Array {
  return new TextEncoder().encode(
    JSON.stringify([
      msg.v,
      msg.kind,
      msg.feedbackId,
      msg.type ?? "",
      msg.body,
      msg.senderDID,
      msg.senderName ?? "",
      msg.sentAt,
    ]),
  );
}

function b64(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

function unb64(s: string): Uint8Array {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function sealAndDeposit(
  transport: MailboxTransport,
  recipientDID: string,
  wire: unknown,
): Promise<string> {
  const sealed = await seal(
    recipientDID,
    new TextEncoder().encode(JSON.stringify(wire)),
  );
  const blob = new TextEncoder().encode(JSON.stringify(sealed));
  return mailboxDeposit(transport, recipientDID, blob, FEEDBACK_MAILBOX_TTL_MS);
}

/** メッセージに署名し、宛先 DID へ封緘して deposit する。封筒 ID を返す。 */
export async function depositFeedbackMessage(
  transport: MailboxTransport,
  sender: Identity,
  recipientDID: string,
  msg: FeedbackWireMessage,
): Promise<string> {
  const sig = await sender.privateKey.sign(canonicalBytes(msg));
  const wire: SignedFeedbackWire = { msg, sig: b64(sig) };
  return sealAndDeposit(transport, recipientDID, wire);
}

/**
 * 文書に載せる内容をバイト上限内に刈り込む（新しい順）。
 * スレッドは最新活動（返信含む）降順・受信は sentAt 降順に 1 本へ並べ、
 * 収まるものだけ採用する。ノードの封筒上限（64 KiB）超過で deposit が
 * 恒久失敗し同期と ack が止まる事態を防ぐ（learnings L-009 系）。
 */
export function buildBoundedStoreSnapshot(
  snapshot: FeedbackStoreSnapshot,
  maxBytes: number = FEEDBACK_STORE_DOC_MAX_BYTES,
): FeedbackStoreSnapshot {
  const enc = new TextEncoder();
  const threadAt = (t: FeedbackStoreSnapshot["threads"][number]) =>
    t.replies.reduce((max, r) => (r.sentAt > max ? r.sentAt : max), t.sentAt);
  const items: Array<
    | { at: string; thread: FeedbackStoreSnapshot["threads"][number] }
    | { at: string; inbox: FeedbackStoreSnapshot["inbox"][number] }
  > = [
    ...snapshot.threads.map((thread) => ({ at: threadAt(thread), thread })),
    ...snapshot.inbox.map((inbox) => ({ at: inbox.sentAt, inbox })),
  ].sort((a, b) => b.at.localeCompare(a.at));

  const bounded: FeedbackStoreSnapshot = { threads: [], inbox: [] };
  // 空スナップショットの直列化コスト＋文書ヘッダ分を初期値に見込む
  let used = enc.encode(JSON.stringify(bounded)).length + 256;
  for (const item of items) {
    const cost = enc.encode(
      JSON.stringify("thread" in item ? item.thread : item.inbox),
    ).length;
    if (used + cost > maxBytes) continue;
    used += cost;
    if ("thread" in item) bounded.threads.push(item.thread);
    else bounded.inbox.push(item.inbox);
  }
  return bounded;
}

/** 文書スナップショットに封筒 ID（返信 or 受信）が含まれるか（ack 可否判定）。 */
function snapshotHasEnvelope(
  snapshot: FeedbackStoreSnapshot,
  envelopeId: string,
): boolean {
  return (
    snapshot.inbox.some((x) => x.envelopeId === envelopeId) ||
    snapshot.threads.some((t) =>
      t.replies.some((r) => r.envelopeId === envelopeId),
    )
  );
}

/**
 * ローカルストアのスナップショット（バイト上限に刈り込み済み）をストア文書として
 * 自 DID 宛に deposit する。実際に載せたスナップショットを返す。
 */
export async function depositFeedbackStoreDoc(
  transport: MailboxTransport,
  self: Identity,
  snapshot: FeedbackStoreSnapshot,
): Promise<{ envelopeId: string; deposited: FeedbackStoreSnapshot }> {
  const bounded = buildBoundedStoreSnapshot(snapshot);
  const doc: FeedbackStoreDoc = {
    v: 1,
    kind: "hvs-feedback-store",
    senderDID: self.did,
    updatedAt: new Date().toISOString(),
    threads: bounded.threads,
    inbox: bounded.inbox,
  };
  const docJson = JSON.stringify(doc);
  const sig = await self.privateKey.sign(new TextEncoder().encode(docJson));
  const wire: SignedStoreDocWire = { doc: docJson, sig: b64(sig) };
  const envelopeId = await sealAndDeposit(transport, self.did, wire);
  return { envelopeId, deposited: bounded };
}

/**
 * 自 DID 宛メールボックスからフィードバック関連封筒を取り出す（非破壊）。
 * 解読・構造・署名検証を通ったものだけ返す。読めない封筒（ロスター等・他用途）
 * には触らない。ストア文書は senderDID が自分（=ユーザー鍵署名）のものだけ
 * 受理する（第三者が seal だけして投げ込んだ偽文書を弾く）。
 */
export async function fetchFeedbackMailbox(
  transport: MailboxTransport,
  self: Identity,
): Promise<{
  messages: ReceivedFeedbackMessage[];
  storeDocs: ReceivedStoreDoc[];
}> {
  const envelopes = await mailboxFetch(transport);
  const messages: ReceivedFeedbackMessage[] = [];
  const storeDocs: ReceivedStoreDoc[] = [];
  for (const env of envelopes) {
    try {
      const box = JSON.parse(new TextDecoder().decode(env.blob)) as SealedBox;
      const wire = JSON.parse(
        new TextDecoder().decode(await openSealed(self, box)),
      ) as Partial<SignedFeedbackWire & SignedStoreDocWire>;

      if (typeof wire?.doc === "string" && typeof wire.sig === "string") {
        const doc = JSON.parse(wire.doc) as FeedbackStoreDoc;
        if (
          doc?.v !== 1 ||
          doc.kind !== "hvs-feedback-store" ||
          doc.senderDID !== self.did
        ) {
          continue;
        }
        const pub = parseToPublicKey(doc.senderDID);
        if (
          !(await pub.verify(
            new TextEncoder().encode(wire.doc),
            unb64(wire.sig),
          ))
        ) {
          continue;
        }
        storeDocs.push({
          envelopeId: env.id,
          depositedAt: env.depositedAt,
          snapshot: { threads: doc.threads ?? [], inbox: doc.inbox ?? [] },
        });
        continue;
      }

      const msg = wire?.msg;
      if (
        msg?.v !== 1 ||
        (msg.kind !== "hvs-feedback" && msg.kind !== "hvs-feedback-reply") ||
        typeof msg.feedbackId !== "string" ||
        typeof msg.body !== "string" ||
        typeof msg.senderDID !== "string" ||
        typeof msg.sentAt !== "string" ||
        typeof wire?.sig !== "string"
      ) {
        continue;
      }
      const pub = parseToPublicKey(msg.senderDID);
      if (!(await pub.verify(canonicalBytes(msg), unb64(wire.sig)))) {
        continue;
      }
      messages.push({ envelopeId: env.id, depositedAt: env.depositedAt, msg });
    } catch {
      // フィードバック封筒として読めない → 触らない（ロスター等の他用途と共存）
    }
  }
  return { messages, storeDocs };
}

/** メールボックス到達設定（ユーザー鍵の短命接続。user-mailbox.ts）。 */
export interface FeedbackChannelConfig {
  identity: Identity;
  mailboxes: KnownPeer[];
  /** テスト・ローカル開発でプライベートアドレスへの dial を許可する。 */
  allowLocalDial?: boolean;
}

/**
 * 開発者へフィードバックを送る。送信スレッドをローカルへ記録し、兄弟端末が
 * 同じスレッドを持てるようストア文書も預け直す（文書 deposit は best-effort）。
 */
export async function sendFeedbackToDeveloper(
  cfg: FeedbackChannelConfig,
  developerDID: string,
  input: { kind: FeedbackKind; body: string; senderName: string },
): Promise<{ feedbackId: string; sentAt: string }> {
  const feedbackId = crypto.randomUUID();
  const sentAt = new Date().toISOString();
  await withUserMailboxTransport(
    cfg.identity,
    cfg.mailboxes,
    async (transport) => {
      await depositFeedbackMessage(transport, cfg.identity, developerDID, {
        v: 1,
        kind: "hvs-feedback",
        feedbackId,
        type: input.kind,
        body: input.body,
        senderDID: cfg.identity.did,
        senderName: input.senderName,
        sentAt,
      });
      addSentFeedbackThread({
        feedbackId,
        kind: input.kind,
        body: input.body,
        sentAt,
      });
      try {
        await depositFeedbackStoreDoc(
          transport,
          cfg.identity,
          loadFeedbackStoreSnapshot(),
        );
      } catch (e) {
        // 文書の預け直し失敗は致命でない（次回 sync が預け直す）
        console.warn("[feedback-mailbox] store doc deposit failed", e);
      }
    },
    cfg.allowLocalDial,
  );
  notifyFeedbackUpdated();
  return { feedbackId, sentAt };
}

/**
 * 開発者として返信を送る（宛先=元フィードバックの送信者 DID）。返信済み状態を
 * ローカルへ記録し、開発者の兄弟端末に伝わるようストア文書も預け直す。
 */
export async function sendFeedbackReply(
  cfg: FeedbackChannelConfig,
  recipientDID: string,
  input: { feedbackId: string; body: string },
): Promise<{ sentAt: string }> {
  const sentAt = new Date().toISOString();
  await withUserMailboxTransport(
    cfg.identity,
    cfg.mailboxes,
    async (transport) => {
      await depositFeedbackMessage(transport, cfg.identity, recipientDID, {
        v: 1,
        kind: "hvs-feedback-reply",
        feedbackId: input.feedbackId,
        body: input.body,
        senderDID: cfg.identity.did,
        sentAt,
      });
      markDeveloperInboxReplied(input.feedbackId, sentAt);
      try {
        await depositFeedbackStoreDoc(
          transport,
          cfg.identity,
          loadFeedbackStoreSnapshot(),
        );
      } catch (e) {
        // 次回 sync が預け直す
        console.warn("[feedback-mailbox] store doc deposit failed", e);
      }
    },
    cfg.allowLocalDial,
  );
  notifyFeedbackUpdated();
  return { sentAt };
}

/** syncFeedbackMailbox の結果。 */
export interface FeedbackSyncResult {
  newReplies: number;
  newFeedback: number;
  /** ストア文書の統合でローカルが変化したか。 */
  mergedFromSiblings: boolean;
}

/**
 * 同期の中核（transport 注入・テスト可能）。
 * 1. ストア文書を統合（兄弟端末の送信スレッド・受信ボックスを取り込む）
 * 2. 個別封筒（返信・受信フィードバック）を取り込む
 * 3. 統合結果をストア文書として預け直す（TTL 更新）
 * 4. 文書 deposit 成功後にのみ、取り込み済み封筒と旧ストア文書を ack する
 */
export async function syncFeedbackMailboxWith(
  transport: MailboxTransport,
  identity: Identity,
  developerDID: string | null,
): Promise<FeedbackSyncResult> {
  const selfIsDeveloper = developerDID != null && identity.did === developerDID;
  const { messages, storeDocs } = await fetchFeedbackMailbox(
    transport,
    identity,
  );

  let mergedFromSiblings = false;
  for (const d of storeDocs) {
    if (mergeFeedbackStoreSnapshot(d.snapshot)) mergedFromSiblings = true;
  }

  let newReplies = 0;
  let newFeedback = 0;
  const ackable: string[] = [];
  for (const r of messages) {
    if (
      r.msg.kind === "hvs-feedback-reply" &&
      developerDID != null &&
      r.msg.senderDID === developerDID
    ) {
      if (
        addFeedbackReplyIfNew(r.msg.feedbackId, {
          envelopeId: r.envelopeId,
          body: r.msg.body,
          sentAt: r.msg.sentAt,
        })
      ) {
        newReplies++;
      }
      // 取り込めた（または既に取り込み済みだった）封筒だけ ack 候補にする。
      // スレッド不在で取り込めなかった返信は残す（送信元/文書到着後に取り込む）。
      if (hasFeedbackReply(r.msg.feedbackId, r.envelopeId)) {
        ackable.push(r.envelopeId);
      }
    } else if (r.msg.kind === "hvs-feedback" && selfIsDeveloper) {
      if (
        addDeveloperInboxItemIfNew({
          envelopeId: r.envelopeId,
          feedbackId: r.msg.feedbackId,
          kind: r.msg.type ?? "other",
          body: r.msg.body,
          senderDID: r.msg.senderDID,
          senderName: r.msg.senderName ?? "",
          sentAt: r.msg.sentAt,
          receivedAt: new Date().toISOString(),
          repliedAt: null,
        })
      ) {
        newFeedback++;
      }
      if (hasDeveloperInboxItem(r.envelopeId)) {
        ackable.push(r.envelopeId);
      }
    }
    // 上記以外（開発者を騙る返信・開発者でない端末宛の hvs-feedback）は
    // 取り込まず ack もしない。
  }

  // 統合結果を預け直す（TTL 更新）。空ストアなら預けるものがない。
  const snapshot = loadFeedbackStoreSnapshot();
  const hasContent = snapshot.threads.length > 0 || snapshot.inbox.length > 0;
  if (hasContent) {
    let deposited: FeedbackStoreSnapshot;
    try {
      deposited = (await depositFeedbackStoreDoc(transport, identity, snapshot))
        .deposited;
    } catch (e) {
      // 預け直せなかった: 何も ack しない（唯一写しを消さない）。次回 sync が再試行。
      console.warn("[feedback-mailbox] store doc deposit failed", e);
      return { newReplies, newFeedback, mergedFromSiblings };
    }
    // 文書に実際に載った封筒だけ ack してよい（サイズ刈り込みで落ちた項目の
    // 封筒は残し、TTL の間は他端末が個別封筒から取り込めるようにする）。
    const stale = [
      ...ackable.filter((id) => snapshotHasEnvelope(deposited, id)),
      ...storeDocs.map((d) => d.envelopeId),
    ];
    if (stale.length > 0) {
      try {
        await mailboxAck(transport, stale);
      } catch {
        // GC 失敗は無害（envelopeId 重複排除が再取得を吸収し、次回 sync が再試行）
      }
    }
  }
  return { newReplies, newFeedback, mergedFromSiblings };
}

/**
 * 自 DID 宛メールボックスを同期する（起動時・フィードバック画面表示時）。
 * 詳細は syncFeedbackMailboxWith を参照。
 */
export async function syncFeedbackMailbox(
  cfg: FeedbackChannelConfig,
  developerDID: string | null,
): Promise<FeedbackSyncResult> {
  const result = await withUserMailboxTransport(
    cfg.identity,
    cfg.mailboxes,
    (transport) =>
      syncFeedbackMailboxWith(transport, cfg.identity, developerDID),
    cfg.allowLocalDial,
  );
  if (
    result.newReplies > 0 ||
    result.newFeedback > 0 ||
    result.mergedFromSiblings
  ) {
    notifyFeedbackUpdated();
  }
  return result;
}
