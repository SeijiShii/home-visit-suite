// ペアリング payload 拡張（デバイス DID・所属グループのポインタ）の
// 収集（発行側）と適用（受信側）。docs/wants/01「ペアリング payload の拡張」。
//
// 設計方針: **QR には鍵（seed）と最小限のポインタだけを載せる**。
// - デバイス DID（発行側端末 1 個分）: 受信側が自ロスターへ追加署名し（鍵は
//   seed で受領済み＝同じ信頼水準）、兄弟端末ダイヤルの宛先にする
// - 所属グループの networkId + 表示名 + 自ロール: 受信側が器（スロット）を作り、
//   ネットワーク実体を自分のメンバーシップだけで合成するためのポインタ
// - ロスター本体・メンバー表は載せない。全容は接続後の兄弟端末 catch-up で
//   収束する（フル同梱していた旧版は QR が人数比例で高密度化し実機で読めなかった）
//
// このモジュールは main バンドル（identity-service / PairPage）から静的 import
// されるため **@linkself/core に依存しない**。以下のキーは所有モジュールと
// 直接文字列で共有する:
// - `hvs.identity`（services/identity-service.ts）… 自分のユーザー DID・ロール
// - `hvs.deviceKeySeed`（lib/linkself/device-key.ts）… デバイス DID の導出元
// - `hvs.deviceRoster`（lib/linkself/device-roster.ts）… 登録済み判定の参照のみ
// - `hvs.networks`（lib/linkself/network-store.ts）… ネットワーク実体の map
// - `hvs.pendingSiblingDevices` … ロスター追加待ちの兄弟デバイス DID
//   （ユーザー DID に紐づけて保存。lib/linkself/device-roster.ts の
//   consumePendingSiblingDevices が起動時に追加署名して消費する）

import {
  createGroupSlot,
  getActiveGroupSlot,
  listGroupSlots,
  nsKey,
  setActiveGroupSlot,
} from "./group-slots";
import { identityFromSeed, seedFromBase64 } from "./identity-crypto";
import type { PairingGroup, PairingPayload } from "./pairing";

const IDENTITY_KEY = "hvs.identity";
const DEVICE_KEY_SEED_KEY = "hvs.deviceKeySeed";
const ROSTER_KEY = "hvs.deviceRoster";
const NETWORKS_KEY = "hvs.networks";
/** ロスターへの追加待ち。`{u: ユーザーDID, d: デバイスDID}` の配列。 */
export const PENDING_SIBLING_DEVICES_KEY = "hvs.pendingSiblingDevices";
/** LinkSelf の SuiteID（docs/wants/01「ストレージ」。実体合成に使う）。 */
const HVS_SUITE_ID = "jp.home-visit-suite";

/** payload に同梱する拡張フィールド一式。 */
export interface PairingExtras {
  deviceDid?: string;
  groups: PairingGroup[];
}

/** ロスター追加待ちの 1 エントリ（ユーザー DID に紐づけて混入を防ぐ）。 */
export interface PendingSiblingDevice {
  /** どのユーザーのロスターに追加してよいか（payload.did）。 */
  u: string;
  /** 追加するデバイス DID。 */
  d: string;
}

function readNetworks(): Record<string, unknown> {
  try {
    return JSON.parse(localStorage.getItem(NETWORKS_KEY) ?? "{}") as Record<
      string,
      unknown
    >;
  } catch {
    return {};
  }
}

/** 保存済み identity のユーザー DID・ロール。無ければ null。 */
function readIdentity(): { did: string; role: string } | null {
  try {
    const raw = localStorage.getItem(IDENTITY_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as { did?: string; role?: string };
    return s.did ? { did: s.did, role: s.role ?? "member" } : null;
  } catch {
    return null;
  }
}

/** ロスター追加待ち一覧（自分のユーザー DID のもの以外も含む生の一覧）。 */
export function listPendingSiblingDevices(): PendingSiblingDevice[] {
  try {
    const raw = JSON.parse(
      localStorage.getItem(PENDING_SIBLING_DEVICES_KEY) ?? "[]",
    ) as unknown[];
    return raw.filter(
      (e): e is PendingSiblingDevice =>
        typeof e === "object" &&
        e !== null &&
        typeof (e as PendingSiblingDevice).u === "string" &&
        typeof (e as PendingSiblingDevice).d === "string",
    );
  } catch {
    return [];
  }
}

/** ロスター追加待ちを全破棄する（別 DID への紐づけ直し時の残骸防止）。 */
export function clearPendingSiblingDevices(): void {
  try {
    localStorage.removeItem(PENDING_SIBLING_DEVICES_KEY);
  } catch {
    // ignore
  }
}

/** 既にロスター（`hvs.deviceRoster`）へ登録済みのデバイスか（軽量 JSON 参照）。 */
function rosterAlreadyHas(userDid: string, deviceDid: string): boolean {
  try {
    const raw = localStorage.getItem(ROSTER_KEY);
    if (!raw) return false;
    const roster = JSON.parse(raw) as {
      userDID?: string;
      devices?: Array<{ deviceDID?: string }>;
    };
    return (
      roster.userDID === userDid &&
      Array.isArray(roster.devices) &&
      roster.devices.some((d) => d.deviceDID === deviceDid)
    );
  } catch {
    return false;
  }
}

/** 追加待ちに積む（重複・登録済みはスキップ）。積んだら true。 */
function queuePendingSiblingDevice(userDid: string, deviceDid: string): boolean {
  try {
    if (rosterAlreadyHas(userDid, deviceDid)) return false;
    const list = listPendingSiblingDevices();
    if (list.some((e) => e.u === userDid && e.d === deviceDid)) return false;
    list.push({ u: userDid, d: deviceDid });
    localStorage.setItem(PENDING_SIBLING_DEVICES_KEY, JSON.stringify(list));
    return true;
  } catch {
    return false;
  }
}

/**
 * 受信側で合成する最小のネットワーク実体（自分のメンバーシップのみ）。
 * catch-up のメンバーシップ判定（listForMember / group_sync_req）に必要な
 * 「自分がメンバーである」事実だけを持ち、全容は兄弟端末の snapshot 応答で
 * 収束する（link-self の epoch LWW が最小実体による上書きを防ぐ）。
 */
function synthesizeMinimalNetwork(
  networkId: string,
  selfDid: string,
  selfRole: string,
): unknown {
  return {
    id: networkId,
    suiteId: HVS_SUITE_ID,
    members: [selfDid],
    memberRoles: { [selfDid]: selfRole || "member" },
  };
}

/**
 * ネットワーク実体を合成すべきか。既存実体が**自分をメンバーに含む**なら温存
 * （同一ユーザーの残骸はより多くを知っている）。自分を含まない実体は別ユーザー
 * 時代の残骸なので上書きする（hvs.networks は purge 対象外のため残り得る）。
 */
function shouldSynthesize(existing: unknown, selfDid: string): boolean {
  if (existing == null) return true;
  const members = (existing as { members?: unknown }).members;
  return !(Array.isArray(members) && members.includes(selfDid));
}

/** グループの器（スロット + networkId キー + 実体）を作る共通処理。 */
function materializeGroups(
  groups: PairingGroup[],
  selfDid: string | undefined,
  fallbackRole: string,
): string | null {
  const networks = readNetworks();
  let firstSlotId: string | null = null;
  for (const g of groups) {
    const slot = createGroupSlot({
      networkId: g.networkId,
      groupName: g.groupName ?? null,
    });
    localStorage.setItem(nsKey(slot.slotId, "networkId"), g.networkId);
    if (selfDid && shouldSynthesize(networks[g.networkId], selfDid)) {
      networks[g.networkId] = synthesizeMinimalNetwork(
        g.networkId,
        selfDid,
        g.role ?? fallbackRole,
      );
    }
    if (firstSlotId == null) firstSlotId = slot.slotId;
  }
  localStorage.setItem(NETWORKS_KEY, JSON.stringify(networks));
  return firstSlotId;
}

/**
 * 発行側: この端末のローカル状態から payload 拡張を組み立てる。
 * どれかが未整備（ネットワーク未配線の端末等）でも失敗させず、あるものだけ載せる。
 */
export async function collectPairingExtras(): Promise<PairingExtras> {
  let deviceDid: string | undefined;
  try {
    const seedB64 = localStorage.getItem(DEVICE_KEY_SEED_KEY);
    if (seedB64) {
      // デバイス DID = デバイス transport 鍵（Ed25519）の did:key。
      deviceDid = (await identityFromSeed(seedFromBase64(seedB64))).did;
    }
  } catch {
    // 導出できなければ載せない（接続時の announce 統合でも収束する）。
  }
  const self = readIdentity();
  const networks = readNetworks();
  const groups: PairingGroup[] = listGroupSlots()
    .filter((s) => s.networkId != null)
    .map((s) => {
      // ロールはグループ毎に異なり得るため、当該実体の自ロールを優先する。
      const entity = networks[s.networkId!] as
        | { memberRoles?: Record<string, string> }
        | undefined;
      const role =
        (self != null ? entity?.memberRoles?.[self.did] : undefined) ??
        self?.role;
      return { networkId: s.networkId!, groupName: s.groupName, role };
    });
  return { deviceDid, groups };
}

/**
 * 受信側: 取り込んだ payload の拡張を適用する。
 * - 発行側デバイス DID をユーザー DID 紐づきでロスター追加待ちに積む
 * - 所属グループの器（スロット + networkId キー + 合成した最小実体）を作る
 * - 先頭グループをアクティブにする
 * 呼び出し前に旧状態（別 ID の残骸等）は purge されている前提
 * （追加待ちの破棄は clearPendingSiblingDevices を purge 側で呼ぶ）。
 */
export function applyPairingExtras(
  payload: Pick<PairingPayload, "did" | "role" | "deviceDid" | "groups">,
): void {
  try {
    if (payload.deviceDid && payload.did) {
      queuePendingSiblingDevice(payload.did, payload.deviceDid);
    }
    const groups = payload.groups ?? [];
    if (groups.length === 0) return;
    const firstSlotId = materializeGroups(
      groups,
      payload.did,
      payload.role ?? "member",
    );
    if (firstSlotId && getActiveGroupSlot()?.slotId !== firstSlotId) {
      setActiveGroupSlot(firstSlotId);
    }
  } catch {
    // localStorage 不可の環境では identity 引き継ぎのみで続行する。
  }
}

/**
 * 同一 DID の登録済み端末が QR を再スキャンしたとき、**欠けている器だけ**を
 * 取り込む（旧版でペアリング済みの端末が同期の収束材料を得る入口。
 * 確立済みの状態＝ロスター登録済みデバイス・既存グループは上書きしない）。
 * 何か適用したら true（呼び出し側は再読み込みして配線し直す）。
 */
export function applyPairingExtrasIfMissing(
  payload: Pick<PairingPayload, "did" | "role" | "deviceDid" | "groups">,
): boolean {
  try {
    let applied = false;
    if (payload.deviceDid && payload.did) {
      applied =
        queuePendingSiblingDevice(payload.did, payload.deviceDid) || applied;
    }
    const existing = new Set(
      listGroupSlots()
        .map((s) => s.networkId)
        .filter((n): n is string => n != null),
    );
    const fresh = (payload.groups ?? []).filter(
      (g) => !existing.has(g.networkId),
    );
    if (fresh.length > 0) {
      materializeGroups(fresh, payload.did, payload.role ?? "member");
      applied = true;
    }
    return applied;
  } catch {
    return false;
  }
}
