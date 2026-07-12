// identity-crypto: did:key 形式・base58・シード往復の検証。

import { describe, expect, it } from "vitest";
import {
  base58btcEncode,
  didToPublicKey,
  generateIdentity,
  identityFromSeed,
  publicKeyToDID,
  seedFromBase64,
  seedToBase64,
} from "./identity-crypto";

describe("base58btcEncode", () => {
  it("先頭ゼロバイトは '1' に対応する", () => {
    expect(base58btcEncode(new Uint8Array([0]))).toBe("1");
    expect(base58btcEncode(new Uint8Array([0, 0]))).toBe("11");
  });

  it("57 は末尾文字 'z' に対応する", () => {
    expect(base58btcEncode(new Uint8Array([57]))).toBe("z");
  });
});

describe("identity 生成", () => {
  it("did:key（LinkSelf 互換: 0xed 単一バイト）を生成し公開鍵へ復号できる", async () => {
    const id = await generateIdentity();
    expect(id.did.startsWith("did:key:z")).toBe(true);
    expect(id.seed).toHaveLength(32);
    expect(id.publicKey).toHaveLength(32);
    // did → 公開鍵 の往復で multicodec/base58 の整合を検証。
    expect(Array.from(didToPublicKey(id.did))).toEqual(
      Array.from(id.publicKey),
    );
  });

  it("publicKeyToDID → didToPublicKey が往復一致する", () => {
    const pub = new Uint8Array(32).map((_, i) => (i * 7 + 1) & 0xff);
    expect(Array.from(didToPublicKey(publicKeyToDID(pub)))).toEqual(
      Array.from(pub),
    );
  });

  it("同一シードからは同一 DID が決定的に得られる", async () => {
    const seed = (await generateIdentity()).seed;
    const a = await identityFromSeed(seed);
    const b = await identityFromSeed(seed);
    expect(a.did).toBe(b.did);
  });

  it("32byte でないシードは拒否する", async () => {
    await expect(identityFromSeed(new Uint8Array(31))).rejects.toThrow();
  });
});

describe("シードの base64 往復", () => {
  it("seedToBase64 → seedFromBase64 で元に戻る", async () => {
    const seed = (await generateIdentity()).seed;
    const restored = seedFromBase64(seedToBase64(seed));
    expect(Array.from(restored)).toEqual(Array.from(seed));
  });
});
