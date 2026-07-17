// @vitest-environment node
// 兄弟端末同期（フィードバックストア文書。docs/wants/07「兄弟端末への同期」）の検証。
// localStorage シムを「1 端末のローカルストア」に見立て、clear() で端末を
// 切り替えながら、偽メールボックス（共有）越しに送信スレッド・返信・
// 受信ボックスが全兄弟端末へ行き渡ることを確認する。
// node 環境なのは seal/openSealed が WebCrypto（crypto.subtle）を要し、
// jsdom がこれを提供しないため。

import { generateIdentity, type MailboxTransport } from "@linkself/core";
import { beforeEach, describe, expect, it } from "vitest";

// feedback-store が読む localStorage の最小シム（node 環境には無い）
const mem = new Map<string, string>();
(globalThis as { localStorage?: unknown }).localStorage = {
  getItem: (k: string) => mem.get(k) ?? null,
  setItem: (k: string, v: string) => void mem.set(k, String(v)),
  removeItem: (k: string) => void mem.delete(k),
  clear: () => mem.clear(),
  key: (i: number) => [...mem.keys()][i] ?? null,
  get length() {
    return mem.size;
  },
};
import {
  addSentFeedbackThread,
  listDeveloperInbox,
  listFeedbackThreads,
  loadFeedbackStoreSnapshot,
} from "../feedback-store";
import {
  buildBoundedStoreSnapshot,
  depositFeedbackMessage,
  depositFeedbackStoreDoc,
  fetchFeedbackMailbox,
  syncFeedbackMailboxWith,
} from "./feedback-mailbox";

interface StoredEnvelope {
  id: string;
  blob: string; // base64
  depositedAt: number;
}

/** mailbox.ts のワイヤ仕様を模す共有メールボックス（feedback-mailbox.test.ts と同じ）。 */
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

describe("feedback-mailbox sibling-device sync (store doc)", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("propagates a sent thread to a fresh sibling device via the store doc", async () => {
    const user = await generateIdentity();
    const mb = fakeMailbox();
    const transport = mb.transportFor(user.did);

    // 端末 A: 送信スレッドを持ち、文書を預けて同期
    addSentFeedbackThread({
      feedbackId: "fb-1",
      kind: "bug_report",
      body: "地図が固まる",
      sentAt: "2026-07-17T00:00:00Z",
    });
    await syncFeedbackMailboxWith(transport, user, null);

    // 端末 B（まっさら）: 同期すると文書からスレッドを得る
    localStorage.clear();
    const result = await syncFeedbackMailboxWith(transport, user, null);
    expect(result.mergedFromSiblings).toBe(true);
    const threads = listFeedbackThreads();
    expect(threads).toHaveLength(1);
    expect(threads[0]!.body).toBe("地図が固まる");
  });

  it("integrates a developer reply on a sibling that got the thread via the doc, then acks it", async () => {
    const user = await generateIdentity();
    const dev = await generateIdentity();
    const mb = fakeMailbox();
    const userTransport = mb.transportFor(user.did);

    // 端末 A: 送信スレッドを文書として預ける
    addSentFeedbackThread({
      feedbackId: "fb-1",
      kind: "bug_report",
      body: "地図が固まる",
      sentAt: "2026-07-17T00:00:00Z",
    });
    await depositFeedbackStoreDoc(
      userTransport,
      user,
      loadFeedbackStoreSnapshot(),
    );

    // 開発者: 返信をユーザー DID 宛に deposit
    await depositFeedbackMessage(mb.transportFor(dev.did), dev, user.did, {
      v: 1,
      kind: "hvs-feedback-reply",
      feedbackId: "fb-1",
      body: "再現手順を教えてください",
      senderDID: dev.did,
      sentAt: "2026-07-18T00:00:00Z",
    });

    // 端末 B（まっさら）: 文書統合→返信取り込み→預け直し→返信封筒 ack
    localStorage.clear();
    const result = await syncFeedbackMailboxWith(userTransport, user, dev.did);
    expect(result.mergedFromSiblings).toBe(true);
    expect(result.newReplies).toBe(1);
    const threads = listFeedbackThreads();
    expect(threads[0]!.replies).toHaveLength(1);
    expect(threads[0]!.replies[0]!.body).toBe("再現手順を教えてください");

    // 返信封筒は ack 済み・最新のストア文書だけが残る
    const { messages, storeDocs } = await fetchFeedbackMailbox(
      userTransport,
      user,
    );
    expect(messages).toHaveLength(0);
    expect(storeDocs).toHaveLength(1);

    // 端末 C（まっさら）: ack 後でも文書から返信込みのスレッドを得る
    localStorage.clear();
    await syncFeedbackMailboxWith(userTransport, user, dev.did);
    expect(listFeedbackThreads()[0]!.replies).toHaveLength(1);
  });

  it("does not ack a reply whose thread is unknown (doc expired case)", async () => {
    const user = await generateIdentity();
    const dev = await generateIdentity();
    const mb = fakeMailbox();
    const userTransport = mb.transportFor(user.did);

    await depositFeedbackMessage(mb.transportFor(dev.did), dev, user.did, {
      v: 1,
      kind: "hvs-feedback-reply",
      feedbackId: "fb-unknown",
      body: "orphan",
      senderDID: dev.did,
      sentAt: "2026-07-18T00:00:00Z",
    });

    const result = await syncFeedbackMailboxWith(userTransport, user, dev.did);
    expect(result.newReplies).toBe(0);
    // スレッド不在 → 取り込まず封筒は残る（スレッドを持つ端末が後で取り込む）
    const { messages } = await fetchFeedbackMailbox(userTransport, user);
    expect(messages).toHaveLength(1);
  });

  it("shares the developer inbox (and replied state) across developer devices", async () => {
    const user = await generateIdentity();
    const dev = await generateIdentity();
    const mb = fakeMailbox();
    const devTransport = mb.transportFor(dev.did);

    // ユーザーがフィードバックを deposit
    await depositFeedbackMessage(mb.transportFor(user.did), user, dev.did, {
      v: 1,
      kind: "hvs-feedback",
      feedbackId: "fb-1",
      type: "encouragement",
      body: "応援しています",
      senderDID: user.did,
      senderName: "山口花子",
      sentAt: "2026-07-17T00:00:00Z",
    });

    // 開発者端末 A: 受信 → 文書預け直し → 封筒 ack
    const a = await syncFeedbackMailboxWith(devTransport, dev, dev.did);
    expect(a.newFeedback).toBe(1);

    // 開発者端末 B（まっさら）: 封筒 ack 済みでも文書経由で受信ボックスを得る
    localStorage.clear();
    const b = await syncFeedbackMailboxWith(devTransport, dev, dev.did);
    expect(b.mergedFromSiblings).toBe(true);
    const inbox = listDeveloperInbox();
    expect(inbox).toHaveLength(1);
    expect(inbox[0]!.body).toBe("応援しています");
  });

  it("bounds the store doc to the byte budget, keeping the newest items", () => {
    // ノードの封筒上限（64 KiB）超過で deposit が恒久失敗しないよう、
    // 文書は新しい順にバイト上限へ刈り込む。
    const big = (n: number) => "あ".repeat(n); // 3 bytes/char
    const thread = (id: string, sentAt: string) => ({
      feedbackId: id,
      kind: "bug_report" as const,
      body: big(1000),
      sentAt,
      replies: [],
    });
    const snapshot = {
      threads: [
        thread("old", "2026-07-01T00:00:00Z"),
        thread("new", "2026-07-17T00:00:00Z"),
        thread("mid", "2026-07-10T00:00:00Z"),
      ],
      inbox: [],
    };
    // 1 スレッド ≈ 3KB。予算 4KB（初期 256B 込み）なら新しい 1 件だけ残る。
    const bounded = buildBoundedStoreSnapshot(snapshot, 4 * 1024);
    expect(bounded.threads.map((t) => t.feedbackId)).toEqual(["new"]);
    // 十分な予算なら全件残る。
    const all = buildBoundedStoreSnapshot(snapshot, 40 * 1024);
    expect(all.threads).toHaveLength(3);
  });

  it("does not ack an integrated envelope that was pruned out of the store doc", async () => {
    const user = await generateIdentity();
    const dev = await generateIdentity();
    const mb = fakeMailbox();
    const userTransport = mb.transportFor(user.did);

    addSentFeedbackThread({
      feedbackId: "fb-1",
      kind: "bug_report",
      body: "小さいスレッド",
      sentAt: "2026-07-17T00:00:00Z",
    });
    // 返信本文が巨大（60KB ≒ 文書予算 40KiB 超え）→ 統合後のスレッドが
    // 文書に載らない → その返信封筒は ack されずメールボックスに残る
    await depositFeedbackMessage(mb.transportFor(dev.did), dev, user.did, {
      v: 1,
      kind: "hvs-feedback-reply",
      feedbackId: "fb-1",
      body: "あ".repeat(20000),
      senderDID: dev.did,
      sentAt: "2026-07-18T00:00:00Z",
    });

    const result = await syncFeedbackMailboxWith(userTransport, user, dev.did);
    // ローカルには取り込まれる
    expect(result.newReplies).toBe(1);
    // 封筒は残る（載らなかったものを消さない）
    const { messages } = await fetchFeedbackMailbox(userTransport, user);
    expect(messages.map((m) => m.msg.feedbackId)).toEqual(["fb-1"]);
  });

  it("rejects a forged store doc sealed to the user but signed by another key", async () => {
    const user = await generateIdentity();
    const attacker = await generateIdentity();
    const mb = fakeMailbox();

    // 攻撃者が「攻撃者署名のストア文書」をユーザー DID 宛に封緘 deposit する
    await depositFeedbackStoreDoc(mb.transportFor(attacker.did), attacker, {
      threads: [
        {
          feedbackId: "fake",
          kind: "other",
          body: "偽スレッド",
          sentAt: "2026-07-17T00:00:00Z",
          replies: [],
        },
      ],
      inbox: [],
    });
    // 攻撃者は自分の DID にしか署名できないため、ユーザーの箱に同じ blob を移す
    // 状況を模す（doc.senderDID=attacker のまま user 宛に置かれたケース）
    const stolen = mb.boxes.get(attacker.did)!;
    mb.boxes.set(user.did, stolen);
    mb.boxes.delete(attacker.did);

    const { storeDocs } = await fetchFeedbackMailbox(
      mb.transportFor(user.did),
      user,
    );
    // seal が攻撃者 DID 宛のため解読不能、仮に解読できても senderDID 不一致で拒否
    expect(storeDocs).toHaveLength(0);
    const result = await syncFeedbackMailboxWith(
      mb.transportFor(user.did),
      user,
      null,
    );
    expect(result.mergedFromSiblings).toBe(false);
    expect(listFeedbackThreads()).toHaveLength(0);
  });
});
