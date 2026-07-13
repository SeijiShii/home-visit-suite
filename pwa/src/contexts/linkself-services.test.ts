// @vitest-environment node
// createLinkSelfServices（スタンドアロン配線）と parseRelays の検証。
// ネットワーク配線（libp2p 起動）は接続先ノードが要るため実機/interop 側で確認する。
// node env: SqliteWasmDatabase の in-memory は node で動く（personal-repository.test と同条件）。
import { describe, expect, it } from "vitest";
import { createLinkSelfServices, parseRelays } from "./linkself-services";

describe("parseRelays", () => {
  it("returns [] for empty/undefined/garbage", () => {
    expect(parseRelays(undefined)).toEqual([]);
    expect(parseRelays("")).toEqual([]);
    expect(parseRelays("  ,  ")).toEqual([]);
    expect(parseRelays("no-equals-sign")).toEqual([]);
    expect(parseRelays("=addr-only")).toEqual([]);
    expect(parseRelays("did-only=")).toEqual([]);
  });

  it("parses a single did=multiaddr entry", () => {
    expect(parseRelays("did:key:zAbc=/dns4/r.example/tcp/443/wss")).toEqual([
      { did: "did:key:zAbc", addrs: ["/dns4/r.example/tcp/443/wss"] },
    ]);
  });

  it("merges multiple addrs of the same did and keeps distinct dids", () => {
    const raw =
      "did:key:zA=/ip4/1.1.1.1/tcp/1/ws, did:key:zA=/ip4/2.2.2.2/tcp/2/ws , did:key:zB=/ip4/3.3.3.3/tcp/3/ws";
    expect(parseRelays(raw)).toEqual([
      {
        did: "did:key:zA",
        addrs: ["/ip4/1.1.1.1/tcp/1/ws", "/ip4/2.2.2.2/tcp/2/ws"],
      },
      { did: "did:key:zB", addrs: ["/ip4/3.3.3.3/tcp/3/ws"] },
    ]);
  });
});

describe("createLinkSelfServices (standalone: no seed/relays)", () => {
  // filename は省略 = in-memory sqlite（node ではメインスレッド oo1）。名前付き
  // 永続（OPFS SAHPool worker）はブラウザ専用のため、リロード跨ぎ永続は browser-e2e /
  // personal-repository.test（共有 in-memory DB）側で確認する。ここは配線と round-trip を見る。
  it("wires settings through settingsService and personalRepo (round-trip)", async () => {
    const b = await createLinkSelfServices({ personalDbFilename: ":memory:" });
    await b.services.settingsService.setLocale("ja");
    await b.services.personalRepo.setAiApiKey("anthropic", "sk-x");

    expect(await b.services.settingsService.getLocale()).toBe("ja");
    expect(await b.services.personalRepo.getAiApiKey("anthropic")).toBe("sk-x");
    await b.stop();
  });

  it("wires ScopeNetwork repos from the in-memory base and returns a no-op stop", async () => {
    const b = await createLinkSelfServices({ personalDbFilename: ":memory:" });
    // 個人設定以外（暫定 InMemory）が配線され動く。stop は非ネットワーク時 no-op。
    expect(b.services.regionRepo).toBeDefined();
    expect(b.services.placeRepo).toBeDefined();
    expect(typeof b.stop).toBe("function");
    await expect(b.stop()).resolves.toBeUndefined();
  });
});
