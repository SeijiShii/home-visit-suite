// @linkself/core（alias でソース直参照）が pwa のツールチェーン下で
// 解決・トランスパイルできることを確認する配線テスト。
// ドメインロジックではなく「依存が繋がっているか」の検証が目的。
import { describe, expect, it } from "vitest";
import { generateIdentity, parseDID } from "@linkself/core";
import { createLinkSelfClient } from "./client-factory";

describe("@linkself/core wiring", () => {
  it("generates an Ed25519 did:key identity", async () => {
    const id = await generateIdentity();
    // LinkSelf の did:key は 0xed 単バイト multicodec（Go 実装互換）。
    expect(id.did).toMatch(/^did:key:z/);
    // did から生の公開鍵 32 バイトへ復号できる。
    const raw = parseDID(id.did);
    expect(raw).toHaveLength(32);
  });

  it("client-factory + libp2p transports resolve under the toolchain", () => {
    // モジュールが解決・トランスパイルできること（libp2p / noise / yamux /
    // websockets の依存配線）を import 成立で確認する。実接続は CP-B で検証。
    expect(typeof createLinkSelfClient).toBe("function");
  });
});
