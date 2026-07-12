// 端末ペアリング（同一 DID の別端末追加）のトークン/ペイロード生成と検証。
// LinkSelf `@linkself/core` の pairing（createToken / PairingSession / complete）に対応する
// アプリ側の暫定実装。ネットワーク越しの鍵配送が未提供のため、鍵素材を QR ペイロードに載せて
// オフラインで同一 identity を新端末へコピーする（モデル = 秘密鍵フルコピー = 同一 DID）。
// 参照: link-self/ts/linkself/src/pairing.ts / docs/wants/01_共通基盤.md「端末ペアリング」

/** ペアリングトークン（LinkSelf の createToken 相当）。 */
export interface PairingToken {
  /** 16byte を 32 桁 hex 化した秘密。 */
  secret: string;
  /** 有効期限（epoch ms）。 */
  expiresAt: number;
}

/** QR に載せる完全ペイロード。新端末が同一 identity を復元するのに必要な素材一式。 */
export interface PairingPayload {
  v: 1;
  secret: string;
  expiresAt: number;
  /** 秘密鍵シード（base64）。復元すると同一 DID になる。 */
  seedB64: string;
  /** 引き継ぐ表示名。 */
  name: string;
  /** 引き継ぐロール（同一ユーザーの別端末なので同一ロール）。 */
  role: string;
  /** 参照/表示用 DID。 */
  did: string;
}

export class PairingError extends Error {
  constructor(
    public readonly code: "token_expired" | "token_invalid",
    message?: string,
  ) {
    super(message ?? code);
    this.name = "PairingError";
  }
}

/** 32 桁 hex のランダム秘密を生成する。 */
function randomSecretHex(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  let hex = "";
  for (const b of bytes) hex += b.toString(16).padStart(2, "0");
  return hex;
}

/** ペアリングトークンを生成する。now は epoch ms（呼び出し側が Date.now() を注入）。 */
export function createPairingToken(ttlMs: number, now: number): PairingToken {
  return { secret: randomSecretHex(), expiresAt: now + ttlMs };
}

/** ペイロードを QR/コード用のテキスト（base64 の JSON）へ符号化する。 */
export function encodePairingPayload(payload: PairingPayload): string {
  const bytes = new TextEncoder().encode(JSON.stringify(payload));
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

/** QR/コードのテキストからペイロードへ復号する。 */
export function decodePairingPayload(text: string): PairingPayload {
  let payload: unknown;
  try {
    const binary = atob(text.trim());
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    const json = new TextDecoder().decode(bytes);
    payload = JSON.parse(json);
  } catch {
    throw new PairingError("token_invalid", "payload decode failed");
  }
  if (!isPairingPayload(payload)) {
    throw new PairingError("token_invalid", "payload shape invalid");
  }
  return payload;
}

/** 期限・形式を検証する。無効なら PairingError を投げる。 */
export function validatePairing(payload: PairingPayload, now: number): void {
  if (!/^[0-9a-f]{32}$/.test(payload.secret)) {
    throw new PairingError("token_invalid", "malformed secret");
  }
  if (now >= payload.expiresAt) {
    throw new PairingError("token_expired");
  }
}

function isPairingPayload(v: unknown): v is PairingPayload {
  if (typeof v !== "object" || v === null) return false;
  const p = v as Record<string, unknown>;
  return (
    p.v === 1 &&
    typeof p.secret === "string" &&
    typeof p.expiresAt === "number" &&
    typeof p.seedB64 === "string" &&
    typeof p.name === "string" &&
    typeof p.role === "string" &&
    typeof p.did === "string"
  );
}
