// 開発者宛フィードバックの封緘送受信（docs/wants/07「フィードバック」）。
//
// グループのクローズド原則の例外チャネル: ユーザーが自分の意思で書いた本文と
// 送信者情報のみを、開発者 DID 宛に seal（E2E 封緘）して常時稼働ノードの
// メールボックスへ deposit する（非同期参加・ロスターメールボックスと同じ
// 既存機構の流用。常時稼働ノードは中身を読めない）。
// 返信は送信者のユーザー DID 宛に封緘 deposit され、ロスター同期と同じ
// 「読めない封筒は触らない」規約で共存する。
//
// フィードバック封筒は **ack（削除）しない**: ユーザー DID 宛メールボックスは
// 兄弟端末（同一ユーザーの全端末）で共有されるため、先に同期した端末が ack すると
// 他端末（返信なら送信元端末）が受信できなくなる。封筒は TTL（14 日）満了で
// ノード側が消すのに任せ、各端末は envelopeId のローカル重複排除で再取得を吸収する。
//
// 封緘は秘匿のみで送信者証明にならないため、ペイロードは送信者のユーザー鍵
// （Ed25519）で署名し、受信側は senderDID の公開鍵で検証する（なりすまし防止）。

import {
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
  markDeveloperInboxReplied,
  notifyFeedbackUpdated,
} from "../feedback-store";
import { withUserMailboxTransport } from "./user-mailbox";

/** 封筒 TTL。ノード既定の MaxTTL（14 日）に合わせる（超過分はノードが丸める）。 */
export const FEEDBACK_MAILBOX_TTL_MS = 14 * 24 * 60 * 60 * 1000;

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

/** ワイヤ形式: 署名付きペイロード（これを seal して deposit する）。 */
interface SignedFeedbackWire {
  msg: FeedbackWireMessage;
  /** base64(Ed25519 署名) */
  sig: string;
}

/** 受信・検証済みのフィードバック封筒。 */
export interface ReceivedFeedbackMessage {
  envelopeId: string;
  depositedAt: number;
  msg: FeedbackWireMessage;
}

/** 署名対象の正準バイト列（フィールド順固定。JSON キー順に依存しない）。 */
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

/** ペイロードに署名し、宛先 DID へ封緘して deposit する。封筒 ID を返す。 */
export async function depositFeedbackMessage(
  transport: MailboxTransport,
  sender: Identity,
  recipientDID: string,
  msg: FeedbackWireMessage,
): Promise<string> {
  const sig = await sender.privateKey.sign(canonicalBytes(msg));
  const wire: SignedFeedbackWire = { msg, sig: b64(sig) };
  const sealed = await seal(
    recipientDID,
    new TextEncoder().encode(JSON.stringify(wire)),
  );
  const blob = new TextEncoder().encode(JSON.stringify(sealed));
  return mailboxDeposit(transport, recipientDID, blob, FEEDBACK_MAILBOX_TTL_MS);
}

/**
 * 自 DID 宛メールボックスからフィードバック封筒を取り出す（非破壊）。
 * 解読・構造・署名検証を通ったものだけ返す。読めない封筒（ロスター等・他用途）
 * には触らない。封筒は ack しない（モジュール冒頭の兄弟端末の理由）。
 */
export async function fetchFeedbackMessages(
  transport: MailboxTransport,
  self: Identity,
): Promise<ReceivedFeedbackMessage[]> {
  const envelopes = await mailboxFetch(transport);
  const out: ReceivedFeedbackMessage[] = [];
  for (const env of envelopes) {
    try {
      const box = JSON.parse(new TextDecoder().decode(env.blob)) as SealedBox;
      const wire = JSON.parse(
        new TextDecoder().decode(await openSealed(self, box)),
      ) as SignedFeedbackWire;
      const msg = wire?.msg;
      if (
        msg?.v !== 1 ||
        (msg.kind !== "hvs-feedback" && msg.kind !== "hvs-feedback-reply") ||
        typeof msg.feedbackId !== "string" ||
        typeof msg.body !== "string" ||
        typeof msg.senderDID !== "string" ||
        typeof msg.sentAt !== "string"
      ) {
        continue;
      }
      const pub = parseToPublicKey(msg.senderDID);
      if (!(await pub.verify(canonicalBytes(msg), unb64(wire.sig)))) {
        continue;
      }
      out.push({ envelopeId: env.id, depositedAt: env.depositedAt, msg });
    } catch {
      // フィードバック封筒として読めない → 触らない（ロスター等の他用途と共存）
    }
  }
  return out;
}

/** メールボックス到達設定（ユーザー鍵の短命接続。user-mailbox.ts）。 */
export interface FeedbackChannelConfig {
  identity: Identity;
  mailboxes: KnownPeer[];
  /** テスト・ローカル開発でプライベートアドレスへの dial を許可する。 */
  allowLocalDial?: boolean;
}

/** 開発者へフィードバックを送る。送信端末のスレッド記録は呼び出し側で行う。 */
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
    (transport) =>
      depositFeedbackMessage(transport, cfg.identity, developerDID, {
        v: 1,
        kind: "hvs-feedback",
        feedbackId,
        type: input.kind,
        body: input.body,
        senderDID: cfg.identity.did,
        senderName: input.senderName,
        sentAt,
      }),
    cfg.allowLocalDial,
  );
  return { feedbackId, sentAt };
}

/** 開発者として返信を送る（宛先=元フィードバックの送信者 DID）。 */
export async function sendFeedbackReply(
  cfg: FeedbackChannelConfig,
  recipientDID: string,
  input: { feedbackId: string; body: string },
): Promise<{ sentAt: string }> {
  const sentAt = new Date().toISOString();
  await withUserMailboxTransport(
    cfg.identity,
    cfg.mailboxes,
    (transport) =>
      depositFeedbackMessage(transport, cfg.identity, recipientDID, {
        v: 1,
        kind: "hvs-feedback-reply",
        feedbackId: input.feedbackId,
        body: input.body,
        senderDID: cfg.identity.did,
        sentAt,
      }),
    cfg.allowLocalDial,
  );
  markDeveloperInboxReplied(input.feedbackId, sentAt);
  notifyFeedbackUpdated();
  return { sentAt };
}

/**
 * 自 DID 宛メールボックスを同期する（起動時・フィードバック画面表示時）。
 * - 開発者からの返信（senderDID が developerDID と一致するもののみ）
 *   → 該当スレッドを持つ端末（=送信元端末）だけが送信スレッドへ取り込む
 * - 自分が開発者（identity.did === developerDID）なら受信フィードバック
 *   → 開発者受信ボックスへ取り込み（開発者の全端末が各自取り込む）
 * 封筒は ack しない（モジュール冒頭。TTL 満了で消える）。再取得は
 * envelopeId のローカル重複排除で吸収する。
 */
export async function syncFeedbackMailbox(
  cfg: FeedbackChannelConfig,
  developerDID: string | null,
): Promise<{ newReplies: number; newFeedback: number }> {
  const selfIsDeveloper =
    developerDID != null && cfg.identity.did === developerDID;
  const result = await withUserMailboxTransport(
    cfg.identity,
    cfg.mailboxes,
    async (transport) => {
      const received = await fetchFeedbackMessages(transport, cfg.identity);
      let newReplies = 0;
      let newFeedback = 0;
      for (const r of received) {
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
        }
        // 上記以外（開発者を騙る返信・開発者でない端末宛の hvs-feedback）は
        // 取り込まない。
      }
      return { newReplies, newFeedback };
    },
    cfg.allowLocalDial,
  );
  if (result.newReplies > 0 || result.newFeedback > 0) {
    notifyFeedbackUpdated();
  }
  return result;
}
