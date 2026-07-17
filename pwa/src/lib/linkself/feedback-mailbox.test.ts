// @vitest-environment node
// フィードバック封筒の封緘 deposit / fetch / 署名検証を、メールボックスの
// ワイヤ仕様（mailbox.ts）を模した偽 transport で検証する。
// fetch は transport 認証 DID にスコープされる実仕様に合わせ、偽メールボックスも
// 呼び出し元 DID ごとの箱を持つ。

import { generateIdentity, type MailboxTransport } from "@linkself/core";
import { describe, expect, it } from "vitest";
import {
  depositFeedbackMessage,
  fetchFeedbackMailbox,
  type FeedbackWireMessage,
} from "./feedback-mailbox";
import type { Identity } from "@linkself/core";

/** メッセージ封筒だけを取り出す簡易ラッパ（本テストの主対象）。 */
async function fetchFeedbackMessages(
  transport: MailboxTransport,
  self: Identity,
) {
  return (await fetchFeedbackMailbox(transport, self)).messages;
}

interface StoredEnvelope {
  id: string;
  blob: string; // base64
  depositedAt: number;
}

/** mailbox.ts のワイヤ仕様を模す共有メールボックス。 */
function fakeMailbox() {
  const boxes = new Map<string, StoredEnvelope[]>();
  let seq = 0;
  const transportFor =
    (callerDID: string): MailboxTransport =>
    async (requestBytes) => {
      const req = JSON.parse(new TextDecoder().decode(requestBytes)) as {
        op: string;
        to?: string;
        blob?: string;
        ids?: string[];
      };
      let res: unknown;
      if (req.op === "deposit" && req.to && req.blob != null) {
        const env = { id: `env-${++seq}`, blob: req.blob, depositedAt: seq };
        const list = boxes.get(req.to) ?? [];
        list.push(env);
        boxes.set(req.to, list);
        res = { ok: true, id: env.id };
      } else if (req.op === "fetch") {
        res = { ok: true, envelopes: boxes.get(callerDID) ?? [] };
      } else if (req.op === "ack") {
        const ids = new Set(req.ids ?? []);
        boxes.set(
          callerDID,
          (boxes.get(callerDID) ?? []).filter((e) => !ids.has(e.id)),
        );
        res = { ok: true };
      } else {
        res = { ok: false, code: "bad_request" };
      }
      return new TextEncoder().encode(JSON.stringify(res));
    };
  return { transportFor, boxes };
}

function msg(
  senderDID: string,
  overrides: Partial<FeedbackWireMessage> = {},
): FeedbackWireMessage {
  return {
    v: 1,
    kind: "hvs-feedback",
    feedbackId: "fb-1",
    type: "bug_report",
    body: "地図が固まります",
    senderDID,
    senderName: "山口花子",
    sentAt: "2026-07-17T00:00:00Z",
    ...overrides,
  };
}

describe("feedback-mailbox", () => {
  it("round-trips a sealed, signed feedback message to the developer DID", async () => {
    const user = await generateIdentity();
    const dev = await generateIdentity();
    const mb = fakeMailbox();

    await depositFeedbackMessage(
      mb.transportFor(user.did),
      user,
      dev.did,
      msg(user.did),
    );

    const received = await fetchFeedbackMessages(mb.transportFor(dev.did), dev);
    expect(received).toHaveLength(1);
    expect(received[0]!.msg.body).toBe("地図が固まります");
    expect(received[0]!.msg.senderDID).toBe(user.did);
    expect(received[0]!.msg.type).toBe("bug_report");

    // 送信者側の箱には何も残らない（宛先スコープ）。
    expect(
      await fetchFeedbackMessages(mb.transportFor(user.did), user),
    ).toHaveLength(0);
  });

  it("supports the reply kind addressed back to the sender", async () => {
    const user = await generateIdentity();
    const dev = await generateIdentity();
    const mb = fakeMailbox();

    await depositFeedbackMessage(
      mb.transportFor(dev.did),
      dev,
      user.did,
      msg(dev.did, {
        kind: "hvs-feedback-reply",
        type: undefined,
        senderName: undefined,
        body: "再現手順を教えてください",
      }),
    );
    const received = await fetchFeedbackMessages(
      mb.transportFor(user.did),
      user,
    );
    expect(received).toHaveLength(1);
    expect(received[0]!.msg.kind).toBe("hvs-feedback-reply");
    expect(received[0]!.msg.senderDID).toBe(dev.did);
  });

  it("drops messages whose signature does not verify (spoofed senderDID)", async () => {
    const user = await generateIdentity();
    const impostor = await generateIdentity();
    const dev = await generateIdentity();
    const mb = fakeMailbox();

    // impostor が user を騙る: senderDID=user だが署名鍵は impostor。
    await depositFeedbackMessage(
      mb.transportFor(impostor.did),
      impostor,
      dev.did,
      msg(user.did),
    );
    expect(
      await fetchFeedbackMessages(mb.transportFor(dev.did), dev),
    ).toHaveLength(0);
  });

  it("leaves non-feedback envelopes untouched (coexists with roster traffic)", async () => {
    const user = await generateIdentity();
    const mb = fakeMailbox();

    // フィードバックでない封筒（生 JSON・封緘なし）を同じ箱に置く。
    const garbage = btoa(JSON.stringify({ hello: "world" }));
    const list = [{ id: "env-x", blob: garbage, depositedAt: 1 }];
    mb.boxes.set(user.did, list);

    const received = await fetchFeedbackMessages(
      mb.transportFor(user.did),
      user,
    );
    expect(received).toHaveLength(0);
    // fetch は非破壊。ack もしていないので封筒は残る。
    expect(mb.boxes.get(user.did)).toHaveLength(1);
  });

  it("fetch is non-destructive: siblings can read the same envelope again", async () => {
    // fetch 自体は封筒を消さない（ack はストア文書 deposit 成功後に sync が行う。
    // feedback-mailbox.ts 冒頭）。fetch を繰り返しても同じ envelopeId が返る。
    const user = await generateIdentity();
    const dev = await generateIdentity();
    const mb = fakeMailbox();
    await depositFeedbackMessage(
      mb.transportFor(user.did),
      user,
      dev.did,
      msg(user.did),
    );
    const first = await fetchFeedbackMessages(mb.transportFor(dev.did), dev);
    const second = await fetchFeedbackMessages(mb.transportFor(dev.did), dev);
    expect(first).toHaveLength(1);
    expect(second).toHaveLength(1);
    expect(second[0]!.envelopeId).toBe(first[0]!.envelopeId);
  });
});
