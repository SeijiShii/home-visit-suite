// デバイスロスター（この端末の永続管理）。
//
// 2層 identity モデル: ユーザー鍵（seed 由来・全端末共有）が「userDID→[deviceDID]」の
// ロスターに署名する。各端末は自分の device DID をロスターに登録し、端末間で収束させる
// ことで「兄弟端末」を相互に認識して devicesync する（link-self roster.ts）。
//
// 本モジュールはローカルの永続と自端末登録までを担う。端末間のロスター収束（相手端末の
// device DID を取り込む）は接続時のロスター交換＝発見フェーズ（docs/wants/11）で行う。
// MyDB に載せないのは、devicesync が peer 決定にロスターを要する鶏卵回避のため
// （ロスターは devicesync の外＝localStorage で保持し、接続時に署名検証してマージ）。

import {
  buildRoster,
  marshalRoster,
  rosterHasDevice,
  unmarshalRoster,
  verifyRoster,
  withDevice,
  type Identity,
  type SignedRoster,
} from "@linkself/core";

/** 署名済みロスター（marshal 済み JSON 文字列）の localStorage キー。 */
const ROSTER_KEY = "hvs.deviceRoster";

function persist(roster: SignedRoster): void {
  localStorage.setItem(
    ROSTER_KEY,
    new TextDecoder().decode(marshalRoster(roster)),
  );
}

function loadPersisted(): SignedRoster | null {
  const s = localStorage.getItem(ROSTER_KEY);
  if (!s) return null;
  try {
    return unmarshalRoster(new TextEncoder().encode(s));
  } catch {
    return null;
  }
}

/**
 * 保存済みロスターを読み込み、この端末（selfDeviceDID）が登録されていることを保証して返す。
 * - 保存済みが同一ユーザーの署名として検証でき、自端末を含む → そのまま返す
 * - 検証できるが自端末未登録 → 自端末を追加・再署名して永続
 * - 無い/壊れている/別ユーザー → 自端末のみの新規ロスターを作成・永続
 */
export async function loadOrCreateRoster(
  userIdentity: Identity,
  selfDeviceDID: string,
  label = "",
): Promise<SignedRoster> {
  const existing = loadPersisted();
  if (
    existing != null &&
    existing.userDID === userIdentity.did &&
    (await verifyRoster(existing))
  ) {
    if (rosterHasDevice(existing, selfDeviceDID)) return existing;
    const updated = await withDevice(userIdentity, existing.devices, {
      deviceDID: selfDeviceDID,
      label,
    });
    persist(updated);
    return updated;
  }
  const fresh = await buildRoster(userIdentity, [
    { deviceDID: selfDeviceDID, label },
  ]);
  persist(fresh);
  return fresh;
}

/** ロスターに端末を追加（またはラベル更新）し、再署名・永続して返す（ペアリング時等）。 */
export async function addDeviceToRoster(
  userIdentity: Identity,
  current: SignedRoster,
  deviceDID: string,
  label = "",
): Promise<SignedRoster> {
  const updated = await withDevice(userIdentity, current.devices, {
    deviceDID,
    label,
  });
  persist(updated);
  return updated;
}
