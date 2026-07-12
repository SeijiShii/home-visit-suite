// pairing: トークン生成・ペイロード往復・期限/形式検証。

import { describe, expect, it } from "vitest";
import {
  createPairingToken,
  decodePairingPayload,
  encodePairingPayload,
  PairingError,
  validatePairing,
  type PairingPayload,
} from "./pairing";

const basePayload = (over: Partial<PairingPayload> = {}): PairingPayload => ({
  v: 1,
  secret: "0123456789abcdef0123456789abcdef",
  expiresAt: 1000,
  seedB64: "c2VlZA==",
  name: "山田太郎",
  role: "admin",
  did: "did:key:zABC",
  ...over,
});

describe("createPairingToken", () => {
  it("now + ttl を expiresAt に、32桁hex の secret を持つ", () => {
    const tok = createPairingToken(300_000, 1_000);
    expect(tok.expiresAt).toBe(301_000);
    expect(tok.secret).toMatch(/^[0-9a-f]{32}$/);
  });
});

describe("ペイロード往復", () => {
  it("encode → decode で元のペイロードに戻る（日本語名含む）", () => {
    const p = basePayload();
    expect(decodePairingPayload(encodePairingPayload(p))).toEqual(p);
  });

  it("壊れたテキストは token_invalid", () => {
    expect(() => decodePairingPayload("not-base64-$$$")).toThrow(PairingError);
  });

  it("形の合わない JSON は token_invalid", () => {
    const bad = btoa(JSON.stringify({ v: 1, secret: "x" }));
    expect(() => decodePairingPayload(bad)).toThrow(PairingError);
  });
});

describe("validatePairing", () => {
  it("期限内・正しい secret なら通る", () => {
    expect(() => validatePairing(basePayload(), 999)).not.toThrow();
  });

  it("期限切れは token_expired", () => {
    try {
      validatePairing(basePayload({ expiresAt: 1000 }), 1000);
      throw new Error("should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(PairingError);
      expect((e as PairingError).code).toBe("token_expired");
    }
  });

  it("secret 形式不正は token_invalid", () => {
    try {
      validatePairing(basePayload({ secret: "zzz" }), 500);
      throw new Error("should have thrown");
    } catch (e) {
      expect((e as PairingError).code).toBe("token_invalid");
    }
  });
});
