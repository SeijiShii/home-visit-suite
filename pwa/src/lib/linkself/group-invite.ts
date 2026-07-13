// グループ招待（別ユーザーをネットワーク=グループに参加させる）の PWA 側ラッパ。
// @linkself/core の invitation（署名付き capability・鍵は運ばない）を home-visit-suite
// 向けに束ねる。デバイスペアリング（同一 DID の鍵コピー）とは別物で、被招待者は自分の
// identity を保ったまま `#/join?i=...` を開いて参加する。
// 設計: link-self/docs/spec/network-invitation.md / docs/wants/04_メンバー管理と権限.md

import {
  buildInviteUrl,
  createInvite,
  decodeInvite,
  extractInviteParam,
  verifyInvite,
  type Identity,
  type Invite,
} from "@linkself/core";
import { linkselfIdentityFromSeed } from "./identity-bridge";

/** home-visit-suite の suite 識別子（invite の suiteId・クロスアプリ replay 防止）。 */
export const HVS_SUITE_ID = "home-visit-suite";

/** グループ招待トークンの有効期限（3 日）。デバイスペアリング（数分）より長い。 */
export const GROUP_INVITE_TTL_MS = 3 * 24 * 60 * 60_000;

export interface IssueGroupInviteParams {
  /** 発行する管理者の 32byte Ed25519 シード（localStorage `hvs.identity` 由来）。 */
  adminSeed: Uint8Array;
  /** 参加先ネットワーク（グループ）の ID。 */
  networkId: string;
  /** 被招待者が管理者へ到達するためのリレー multiaddr 群。 */
  relays: string[];
  /** 招待 URL のベース（例: `https://host/`）。省略時は実行時オリジン。 */
  baseUrl?: string;
  /** 割り当てるロール。既定は活動メンバー（member）。 */
  role?: string;
  /** TTL 上書き（テスト用、既定 3 日）。 */
  ttlMs?: number;
  /** 現在時刻の注入（テスト用）。 */
  now?: () => number;
}

export interface IssuedGroupInvite {
  /** ブラウザで開くと参加フローに入る招待 URL（`#/join?i=...`）。 */
  url: string;
  /** 失効時刻（epoch ms）。 */
  expiresAt: number;
  /** 生成した招待（QR 表示や再符号化に使う）。 */
  invite: Invite;
}

/** グループ招待 URL（QR にも載せる）と失効時刻を生成する（シード指定）。 */
export async function issueGroupInvite(
  params: IssueGroupInviteParams,
): Promise<IssuedGroupInvite> {
  const identity = await linkselfIdentityFromSeed(params.adminSeed);
  return buildGroupInviteUrl(identity, params);
}

/**
 * グループ招待 URL を生成する（Identity 指定）。起動中の LinkSelfClient は
 * `userIdentity` で署名できるため、生シードを扱わずに済む。
 */
export async function buildGroupInviteUrl(
  identity: Identity,
  params: Omit<IssueGroupInviteParams, "adminSeed">,
): Promise<IssuedGroupInvite> {
  const invite = await createInvite(
    identity,
    {
      networkId: params.networkId,
      suiteId: HVS_SUITE_ID,
      role: params.role ?? "member",
      relays: params.relays,
    },
    params.ttlMs ?? GROUP_INVITE_TTL_MS,
    params.now,
  );
  const baseUrl = params.baseUrl ?? defaultBaseUrl();
  return {
    url: buildInviteUrl(baseUrl, invite),
    expiresAt: invite.expiresAt,
    invite,
  };
}

/**
 * 招待 URL / フラグメント / 生ペイロードから Invite を取り出し、署名・期限を検証する。
 * 無効なら InviteError を投げる。
 */
export async function parseGroupInvite(
  input: string,
  now?: () => number,
): Promise<Invite> {
  const invite = decodeInvite(extractInviteParam(input));
  await verifyInvite(invite, now);
  return invite;
}

/** 招待 URL のベース。env で公開 URL を上書きでき、未設定なら実行時オリジンにする。 */
function defaultBaseUrl(): string {
  const override = import.meta.env.VITE_INVITE_BASE_URL as string | undefined;
  return override || window.location.origin + import.meta.env.BASE_URL;
}
