// 自分の ID（LinkSelf DID）の生成・エンコード・鍵シードの書き出し/取り込み。
// LinkSelf `@linkself/core` の did:key 形式（0xed + 32byte 公開鍵を base58btc・'z' 接頭辞）と
// バイト互換にし、M5 で @linkself/core へ差し替えても同一 DID になるようにする。
// 参照: link-self/ts/linkself/src/did.ts / docs/wants/01_共通基盤.md「自分の ID の作成と保管」
//
// 署名・ネットワークは現状未使用のため、鍵は生成・保管・ペアリング転送のみに使う。

import * as ed from "@noble/ed25519";

// @noble/ed25519 v3 の非同期 API（getPublicKeyAsync）は SHA-512 を用いる。既定実装は
// digest へ ArrayBuffer を渡す形で一部環境（Node/jsdom の SubtleCrypto）が型を弾くため、
// Uint8Array を直接渡す実装を注入する。SHA-512 は Ed25519 と違い全モダンブラウザで利用可能。
ed.hashes.sha512Async = async (message: Uint8Array) =>
  new Uint8Array(
    await crypto.subtle.digest("SHA-512", message as BufferSource),
  );

/** Ed25519 の did:key マルチコーデック。Go/LinkSelf に合わせ単一バイト 0xed（varint 0xed01 ではない）。 */
const ED25519_MULTICODEC = 0xed;

const BASE58_ALPHABET =
  "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

/** 自分の identity。seed は 32byte の Ed25519 秘密鍵シード。 */
export interface Identity {
  did: string;
  seed: Uint8Array;
  publicKey: Uint8Array;
}

/** 新しい identity（Ed25519 鍵対 + did:key）を生成する。 */
export async function generateIdentity(): Promise<Identity> {
  return identityFromSeed(ed.utils.randomSecretKey());
}

/** 32byte シードから identity を復元する（決定的）。 */
export async function identityFromSeed(seed: Uint8Array): Promise<Identity> {
  if (seed.length !== 32) {
    throw new Error(`seed must be 32 bytes, got ${seed.length}`);
  }
  const publicKey = await ed.getPublicKeyAsync(seed);
  return {
    did: publicKeyToDID(publicKey),
    seed: Uint8Array.from(seed),
    publicKey,
  };
}

/** Ed25519 公開鍵を did:key 文字列へ変換する。 */
export function publicKeyToDID(publicKey: Uint8Array): string {
  const bytes = new Uint8Array(1 + publicKey.length);
  bytes[0] = ED25519_MULTICODEC;
  bytes.set(publicKey, 1);
  return `did:key:z${base58btcEncode(bytes)}`;
}

/** シードを base64 文字列へ（localStorage 保存・QR 転送用）。 */
export function seedToBase64(seed: Uint8Array): string {
  let binary = "";
  for (const b of seed) binary += String.fromCharCode(b);
  return btoa(binary);
}

/** base64 文字列からシード（Uint8Array）へ復元する。 */
export function seedFromBase64(b64: string): Uint8Array {
  const binary = atob(b64);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

/** did:key 文字列から Ed25519 公開鍵（32byte）を取り出す。 */
export function didToPublicKey(did: string): Uint8Array {
  const prefix = "did:key:z";
  if (!did.startsWith(prefix)) throw new Error(`unsupported did: ${did}`);
  const decoded = base58btcDecode(did.slice(prefix.length));
  if (decoded[0] !== ED25519_MULTICODEC) {
    throw new Error("not an Ed25519 did:key");
  }
  return decoded.slice(1);
}

/** Bitcoin 系 base58（base58btc）エンコード。 */
export function base58btcEncode(bytes: Uint8Array): string {
  let zeros = 0;
  while (zeros < bytes.length && bytes[zeros] === 0) zeros++;

  const digits: number[] = [];
  for (let i = zeros; i < bytes.length; i++) {
    let carry = bytes[i];
    for (let j = 0; j < digits.length; j++) {
      carry += digits[j] << 8;
      digits[j] = carry % 58;
      carry = (carry / 58) | 0;
    }
    while (carry > 0) {
      digits.push(carry % 58);
      carry = (carry / 58) | 0;
    }
  }

  let out = "";
  for (let i = 0; i < zeros; i++) out += BASE58_ALPHABET[0];
  for (let i = digits.length - 1; i >= 0; i--)
    out += BASE58_ALPHABET[digits[i]];
  return out;
}

/** Bitcoin 系 base58（base58btc）デコード。 */
export function base58btcDecode(str: string): Uint8Array {
  let zeros = 0;
  while (zeros < str.length && str[zeros] === BASE58_ALPHABET[0]) zeros++;

  const bytes: number[] = [];
  for (let i = zeros; i < str.length; i++) {
    let carry = BASE58_ALPHABET.indexOf(str[i]);
    if (carry < 0) throw new Error(`invalid base58 char: ${str[i]}`);
    for (let j = 0; j < bytes.length; j++) {
      carry += bytes[j] * 58;
      bytes[j] = carry & 0xff;
      carry >>= 8;
    }
    while (carry > 0) {
      bytes.push(carry & 0xff);
      carry >>= 8;
    }
  }

  const out = new Uint8Array(zeros + bytes.length);
  for (let i = bytes.length - 1, k = zeros; i >= 0; i--, k++) out[k] = bytes[i];
  return out;
}
