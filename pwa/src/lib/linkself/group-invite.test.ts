// @vitest-environment node
// jsdom の WebCrypto シムは @linkself/core の Ed25519 sign/verify と相性が悪く
// 署名検証が誤って失敗する（実ブラウザでは link-self の browser-e2e で検証済み・
// 問題なし）。この招待ロジックは純粋な暗号処理のため node 環境でテストする。
import { describe, expect, it } from "vitest";
import {
  GROUP_INVITE_TTL_MS,
  HVS_SUITE_ID,
  issueGroupInvite,
  parseGroupInvite,
} from "./group-invite";

const SEED = new Uint8Array(32).fill(7);
const RELAYS = [
  "/dns4/relay.example/tcp/443/wss/p2p/12D3KooWRelay/p2p-circuit",
];
const BASE = "https://hvs.example/";

describe("issueGroupInvite", () => {
  it("builds a 3-day #/join URL carrying a member invite (no key material)", async () => {
    const now = 1_000_000;
    const { url, expiresAt, invite } = await issueGroupInvite({
      adminSeed: SEED,
      networkId: "net-1",
      relays: RELAYS,
      baseUrl: BASE,
      now: () => now,
    });

    expect(url).toContain("#/join?i=");
    expect(url.startsWith("https://hvs.example/#/join?i=")).toBe(true);
    expect(expiresAt).toBe(now + GROUP_INVITE_TTL_MS);
    expect(invite.role).toBe("member");
    expect(invite.suiteId).toBe(HVS_SUITE_ID);
    expect(invite.networkId).toBe("net-1");
    expect(invite.relays).toEqual(RELAYS);
    expect(invite).not.toHaveProperty("seedB64");
  });

  it("honors an explicit role and TTL override", async () => {
    const now = 1_000_000;
    const { invite, expiresAt } = await issueGroupInvite({
      adminSeed: SEED,
      networkId: "net-1",
      relays: RELAYS,
      baseUrl: BASE,
      role: "editor",
      ttlMs: 60_000,
      now: () => now,
    });
    expect(invite.role).toBe("editor");
    expect(expiresAt).toBe(now + 60_000);
  });
});

describe("parseGroupInvite", () => {
  it("round-trips a freshly issued invite URL and verifies it", async () => {
    const now = 1_000_000;
    const { url, invite } = await issueGroupInvite({
      adminSeed: SEED,
      networkId: "net-1",
      relays: RELAYS,
      baseUrl: BASE,
      now: () => now,
    });
    const parsed = await parseGroupInvite(url, () => now);
    expect(parsed).toEqual(invite);
  });

  it("rejects an expired invite", async () => {
    const issuedAt = 1_000_000;
    const { url } = await issueGroupInvite({
      adminSeed: SEED,
      networkId: "net-1",
      relays: RELAYS,
      baseUrl: BASE,
      ttlMs: 60_000,
      now: () => issuedAt,
    });
    await expect(
      parseGroupInvite(url, () => issuedAt + 60_001),
    ).rejects.toMatchObject({ code: "invite_expired" });
  });
});
