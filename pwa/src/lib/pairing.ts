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

/** payload に同梱する所属グループ 1 件分（docs/wants/01「ペアリング payload の拡張」）。 */
export interface PairingGroup {
  /** LinkSelf ネットワーク ID。 */
  networkId: string;
  /** 表示用グループ名（無ければ null）。 */
  groupName: string | null;
  /**
   * LinkSelf ネットワーク実体（メンバー・ロール表）のスナップショット。
   * 同一アカウントの端末間には membership 配信が届かないため、新端末は
   * これを種にして catch-up のメンバーシップ判定材料を得る。
   */
  network?: unknown;
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
  /** 発行側端末のデバイス DID（2026-07-15 拡張。旧 payload には無い）。 */
  deviceDid?: string;
  /** 発行側の署名済みデバイスロスター（marshalRoster の JSON 文字列）。 */
  rosterJson?: string;
  /** 発行側が所属するグループ一覧。新端末はここからグループの器を作る。 */
  groups?: PairingGroup[];
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

function toBase64Url(b64: string): string {
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(s: string): string {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/");
  const pad = b64.length % 4 === 0 ? "" : "=".repeat(4 - (b64.length % 4));
  return b64 + pad;
}

/** ペイロードを URL/QR 用のテキスト（base64url の JSON）へ符号化する。 */
export function encodePairingPayload(payload: PairingPayload): string {
  const bytes = new TextEncoder().encode(JSON.stringify(payload));
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return toBase64Url(btoa(binary));
}

/** base64url（旧 base64 も許容）のテキストからペイロードへ復号する。 */
export function decodePairingPayload(text: string): PairingPayload {
  let payload: unknown;
  try {
    const binary = atob(fromBase64Url(text.trim()));
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

/**
 * ペアリング用のアプリ URL を組み立てる。鍵素材はサーバーへ送られない
 * フラグメント（`#/pair?d=...`）に載せる。
 * baseUrl 例: `https://host/` や `http://localhost:5173/`（末尾 / と既存 hash は正規化）。
 */
export function buildPairingUrl(
  baseUrl: string,
  payload: PairingPayload,
): string {
  const base = baseUrl.replace(/#.*$/, "").replace(/\/+$/, "");
  return `${base}/#/pair?d=${encodePairingPayload(payload)}`;
}

/**
 * 入力（ペアリング URL 全体、フラグメント、または生のペイロード文字列）から
 * ペイロード部分を取り出す。`d=` パラメータがあればその値を、無ければ入力自体を返す。
 */
export function extractPairingPayloadParam(input: string): string {
  const s = input.trim();
  const m = s.match(/[?&]d=([^&\s]+)/);
  return m ? m[1] : s;
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
  const baseOk =
    p.v === 1 &&
    typeof p.secret === "string" &&
    typeof p.expiresAt === "number" &&
    typeof p.seedB64 === "string" &&
    typeof p.name === "string" &&
    typeof p.role === "string" &&
    typeof p.did === "string";
  if (!baseOk) return false;
  // 2026-07-15 拡張フィールド（旧 payload には無いので省略可）。
  if (p.deviceDid != null && typeof p.deviceDid !== "string") return false;
  if (p.rosterJson != null && typeof p.rosterJson !== "string") return false;
  if (p.groups != null) {
    if (!Array.isArray(p.groups)) return false;
    for (const g of p.groups) {
      if (
        typeof g !== "object" ||
        g === null ||
        typeof (g as Record<string, unknown>).networkId !== "string"
      ) {
        return false;
      }
    }
  }
  return true;
}
