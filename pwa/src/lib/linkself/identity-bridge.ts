// アプリの identity（32byte Ed25519 シード）から @linkself/core の Identity を導出する。
// 両実装は同一シードから同一 did:key（Go 互換 0xed + 32byte 公開鍵）を生成するため、
// localStorage 保管の identity と LinkSelf ネットワーク上の identity は同一 DID になる。
// これにより既存ユーザーの DID を保ったまま M5 の LinkSelf 統合へ移行できる。
// 参照: lib/identity-crypto.ts / link-self/ts/linkself/src/did.ts

import { generateKeyPairFromSeed } from "@libp2p/crypto/keys";
import { identityFromPrivateKey, type Identity } from "@linkself/core";

/** 32byte Ed25519 シードから @linkself/core の Identity（libp2p 秘密鍵 + DID）を導出する。 */
export async function linkselfIdentityFromSeed(
  seed: Uint8Array,
): Promise<Identity> {
  if (seed.length !== 32) {
    throw new Error(`seed must be 32 bytes, got ${seed.length}`);
  }
  const privateKey = await generateKeyPairFromSeed("Ed25519", seed);
  return identityFromPrivateKey(privateKey);
}
