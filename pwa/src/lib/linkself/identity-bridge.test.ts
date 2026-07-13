// identity ブリッジが、アプリ既存の identity-crypto と同一シードから
// 同一 did:key を生成することを固定化する（DID が M5 移行で変わらない保証）。
import { describe, expect, it } from "vitest";
import { identityFromSeed as appIdentityFromSeed } from "../identity-crypto";
import { linkselfIdentityFromSeed } from "./identity-bridge";

describe("identity bridge (app seed ⇔ @linkself/core)", () => {
  it("derives the same did:key from the same 32-byte seed", async () => {
    // 決定的シード 0x01..0x20（link-self の golden ベクタと同系）。
    const seed = new Uint8Array(32);
    for (let i = 0; i < 32; i++) seed[i] = i + 1;

    const app = await appIdentityFromSeed(seed);
    const ls = await linkselfIdentityFromSeed(seed);

    expect(ls.did).toBe(app.did);
    expect(ls.did).toMatch(/^did:key:z/);
  });
});
