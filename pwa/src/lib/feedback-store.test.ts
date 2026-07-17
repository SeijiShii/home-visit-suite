// 開発者宛フィードバックのローカル保存（送信スレッド・受信ボックス）の検証。
// jsdom の localStorage 上で重複排除（envelopeId）とスタブスレッド生成を確認する。

import { beforeEach, describe, expect, it } from "vitest";
import {
  addDeveloperInboxItemIfNew,
  addFeedbackReplyIfNew,
  addSentFeedbackThread,
  listDeveloperInbox,
  listFeedbackThreads,
  markDeveloperInboxReplied,
  type DeveloperInboxItem,
} from "./feedback-store";

function inboxItem(
  overrides: Partial<DeveloperInboxItem> = {},
): DeveloperInboxItem {
  return {
    envelopeId: "env-1",
    feedbackId: "fb-1",
    kind: "bug_report",
    body: "本文",
    senderDID: "did:key:zsender",
    senderName: "山口花子",
    sentAt: "2026-07-17T00:00:00Z",
    receivedAt: "2026-07-17T01:00:00Z",
    repliedAt: null,
    ...overrides,
  };
}

describe("feedback-store", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("records sent threads and merges replies in sentAt order", () => {
    addSentFeedbackThread({
      feedbackId: "fb-1",
      kind: "bug_report",
      body: "地図が固まる",
      sentAt: "2026-07-17T00:00:00Z",
    });
    expect(
      addFeedbackReplyIfNew("fb-1", {
        envelopeId: "env-2",
        body: "2通目",
        sentAt: "2026-07-19T00:00:00Z",
      }),
    ).toBe(true);
    expect(
      addFeedbackReplyIfNew("fb-1", {
        envelopeId: "env-1",
        body: "1通目",
        sentAt: "2026-07-18T00:00:00Z",
      }),
    ).toBe(true);

    const threads = listFeedbackThreads();
    expect(threads).toHaveLength(1);
    expect(threads[0]!.replies.map((r) => r.body)).toEqual(["1通目", "2通目"]);
  });

  it("drops duplicate replies by envelopeId (envelopes stay until TTL)", () => {
    addSentFeedbackThread({
      feedbackId: "fb-1",
      kind: "other",
      body: "x",
      sentAt: "2026-07-17T00:00:00Z",
    });
    const reply = {
      envelopeId: "env-1",
      body: "返信",
      sentAt: "2026-07-18T00:00:00Z",
    };
    expect(addFeedbackReplyIfNew("fb-1", reply)).toBe(true);
    expect(addFeedbackReplyIfNew("fb-1", reply)).toBe(false);
    expect(listFeedbackThreads()[0]!.replies).toHaveLength(1);
  });

  it("skips replies without a matching thread (sibling device keeps envelope)", () => {
    // 送信元でない兄弟端末はスレッドを持たない。取り込まず false を返し、
    // 封筒はメールボックスに残る（送信元端末が後で取り込む）。
    expect(
      addFeedbackReplyIfNew("fb-unknown", {
        envelopeId: "env-9",
        body: "返信のみ",
        sentAt: "2026-07-18T00:00:00Z",
      }),
    ).toBe(false);
    expect(listFeedbackThreads()).toHaveLength(0);
  });

  it("deduplicates inbox items by envelopeId and marks replied", () => {
    expect(addDeveloperInboxItemIfNew(inboxItem())).toBe(true);
    expect(addDeveloperInboxItemIfNew(inboxItem())).toBe(false);
    expect(listDeveloperInbox()).toHaveLength(1);

    markDeveloperInboxReplied("fb-1", "2026-07-19T00:00:00Z");
    expect(listDeveloperInbox()[0]!.repliedAt).toBe("2026-07-19T00:00:00Z");
  });
});
