// ペアリング payload 拡張（デバイス DID・署名済みロスター・所属グループ一覧）の
// 収集（発行側）と適用（受信側）。docs/wants/01「ペアリング payload の拡張」。
//
// このモジュールは main バンドル（identity-service / PairPage）から静的 import
// されるため **@linkself/core に依存しない**（libp2p/sqlite-wasm を引き込まない）。
// そのため以下のキーは所有モジュールと直接文字列で共有する:
// - `hvs.deviceKeySeed`（lib/linkself/device-key.ts）… デバイス DID の導出元
// - `hvs.deviceRoster`（lib/linkself/device-roster.ts）… marshalRoster の JSON 文字列
// - `hvs.networks`（lib/linkself/network-store.ts）… ネットワーク実体の map

import {
  createGroupSlot,
  getActiveGroupSlot,
  listGroupSlots,
  nsKey,
  setActiveGroupSlot,
} from "./group-slots";
import { identityFromSeed, seedFromBase64 } from "./identity-crypto";
import type { PairingGroup, PairingPayload } from "./pairing";

const DEVICE_KEY_SEED_KEY = "hvs.deviceKeySeed";
const ROSTER_KEY = "hvs.deviceRoster";
const NETWORKS_KEY = "hvs.networks";
/** LinkSelf の SuiteID（docs/wants/01「ストレージ」。実体に無い場合のフォールバック）。 */
const HVS_SUITE_ID_FALLBACK = "jp.home-visit-suite";

/** payload に同梱する拡張フィールド一式。 */
export interface PairingExtras {
  deviceDid?: string;
  rosterJson?: string;
  groups: PairingGroup[];
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

/** 保存済み identity（`hvs.identity`）のユーザー DID・ロール。無ければ null。 */
function readIdentity(): { did: string; role: string } | null {
  try {
    const raw = localStorage.getItem("hvs.identity");
    if (!raw) return null;
    const s = JSON.parse(raw) as { did?: string; role?: string };
    return s.did ? { did: s.did, role: s.role ?? "member" } : null;
  } catch {
    return null;
  }
}

/** marshalRoster JSON の userDID。解析できなければ null。 */
function parseRosterUserDid(rosterJson: string): string | null {
  try {
    return (JSON.parse(rosterJson) as { userDID?: string }).userDID ?? null;
  } catch {
    return null;
  }
}

/**
 * QR に載せるネットワーク実体の**最小スナップショット**（自分のメンバーシップのみ）。
 * フル実体（全メンバー・ロール表）を同梱すると QR がグループ人数に比例して
 * 高密度化し実機カメラで読めなくなるため、catch-up の membership 判定に必要な
 * 「自分がメンバーである」事実だけを一定サイズで運ぶ。全メンバーの実体・
 * メンバー表は接続後の catch-up（users テーブル同期）で収束する。
 */
function minimalNetworkSnapshot(
  networkId: string,
  entity: unknown,
  selfDid: string,
  selfRole: string,
): unknown {
  const e = entity as
    { suiteId?: string; memberRoles?: Record<string, string> } | undefined;
  const role = e?.memberRoles?.[selfDid] ?? selfRole ?? "member";
  return {
    id: networkId,
    suiteId: e?.suiteId ?? HVS_SUITE_ID_FALLBACK,
    members: [selfDid],
    memberRoles: { [selfDid]: role },
  };
}

/** marshalRoster JSON の掲載デバイス数。解析できなければ 0。 */
function parseRosterDeviceCount(rosterJson: string): number {
  try {
    const d = (JSON.parse(rosterJson) as { devices?: unknown[] }).devices;
    return Array.isArray(d) ? d.length : 0;
  } catch {
    return 0;
  }
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
    // 導出できなければ載せない（受信側はロスターからも学べる）。
  }
  const self = readIdentity();
  // ロスターは自分のユーザー DID のものだけ同梱する（別 ID へ切替えた端末に
  // 残った旧ユーザーのロスター残骸を運ばない）。
  let rosterJson = localStorage.getItem(ROSTER_KEY) ?? undefined;
  if (rosterJson) {
    if (self == null || parseRosterUserDid(rosterJson) !== self.did) {
      rosterJson = undefined;
    }
  }
  const networks = readNetworks();
  // ネットワーク実体は最小スナップショット（自分のメンバーシップのみ）に落とす。
  // QR の密度をグループ人数に依存させないため（minimalNetworkSnapshot 参照）。
  const groups: PairingGroup[] = listGroupSlots()
    .filter((s) => s.networkId != null)
    .map((s) => ({
      networkId: s.networkId!,
      groupName: s.groupName,
      network:
        self != null
          ? minimalNetworkSnapshot(
              s.networkId!,
              networks[s.networkId!],
              self.did,
              self.role,
            )
          : undefined,
    }));
  return { deviceDid, rosterJson, groups };
}

/**
 * 受信側: 取り込んだ payload の拡張を適用する。
 * - ロスターを保存する（次回起動の loadOrCreateRoster が自デバイスを追加・再署名）
 * - 所属グループの器（スロット + networkId キー + ネットワーク実体）を作る
 * - 先頭グループをアクティブにする
 * 呼び出し前に旧状態（別 ID の残骸等）は purge されている前提。
 */
export function applyPairingExtras(
  payload: Pick<PairingPayload, "rosterJson" | "groups">,
): void {
  try {
    if (payload.rosterJson) {
      localStorage.setItem(ROSTER_KEY, payload.rosterJson);
    }
    const groups = payload.groups ?? [];
    if (groups.length === 0) return;
    const networks = readNetworks();
    let firstSlotId: string | null = null;
    for (const g of groups) {
      const slot = createGroupSlot({
        networkId: g.networkId,
        groupName: g.groupName ?? null,
      });
      localStorage.setItem(nsKey(slot.slotId, "networkId"), g.networkId);
      if (g.network != null) networks[g.networkId] = g.network;
      if (firstSlotId == null) firstSlotId = slot.slotId;
    }
    localStorage.setItem(NETWORKS_KEY, JSON.stringify(networks));
    if (firstSlotId && getActiveGroupSlot()?.slotId !== firstSlotId) {
      setActiveGroupSlot(firstSlotId);
    }
  } catch {
    // localStorage 不可の環境では identity 引き継ぎのみで続行する。
  }
}

/**
 * 同一 DID の登録済み端末が QR を再スキャンしたとき、**欠けている器だけ**を
 * 取り込む（v2 以前にペアリング済みの端末が同期の収束材料を得る入口。
 * 確立済みの状態は上書きしない）。何か適用したら true（呼び出し側は再読み込み
 * して配線し直す）。
 * - ロスター: ローカルが無い、または自分 1 台のみのときだけ payload 側で置き換える
 *   （payload のロスターは同一ユーザー鍵の署名済み。自デバイスは次回起動の
 *   loadOrCreateRoster が追加・再署名する）
 * - グループ: ローカルに無い networkId のみ器を作る（アクティブは変更しない）
 */
export function applyPairingExtrasIfMissing(
  payload: Pick<PairingPayload, "did" | "rosterJson" | "groups">,
): boolean {
  try {
    let applied = false;
    if (
      payload.rosterJson &&
      parseRosterUserDid(payload.rosterJson) === payload.did
    ) {
      const local = localStorage.getItem(ROSTER_KEY);
      const localCount = local ? parseRosterDeviceCount(local) : 0;
      const incomingCount = parseRosterDeviceCount(payload.rosterJson);
      if (
        (local == null || localCount <= 1) &&
        incomingCount > 0 &&
        local !== payload.rosterJson
      ) {
        localStorage.setItem(ROSTER_KEY, payload.rosterJson);
        applied = true;
      }
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
      const networks = readNetworks();
      for (const g of fresh) {
        const slot = createGroupSlot({
          networkId: g.networkId,
          groupName: g.groupName ?? null,
        });
        localStorage.setItem(nsKey(slot.slotId, "networkId"), g.networkId);
        if (g.network != null) networks[g.networkId] = g.network;
      }
      localStorage.setItem(NETWORKS_KEY, JSON.stringify(networks));
      applied = true;
    }
    return applied;
  } catch {
    return false;
  }
}
