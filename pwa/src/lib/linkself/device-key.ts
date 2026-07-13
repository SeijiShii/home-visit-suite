// 端末固有の libp2p transport 鍵（デバイス鍵）の生成・永続。
//
// LinkSelf のマルチデバイス対応では、libp2p の host 鍵（= peerId）を DID 鍵から
// 分離する。DID 鍵は全端末で共有（同一 DID フルコピー）だが、transport 鍵は端末ごとに
// 固有にすることで、同一 DID の複数端末が別 peerId を持ち相互に devicesync できる
// （link-self: mutualAuth / peersForDID。docs/wants/01「端末ペアリング」）。
//
// 鍵はこの端末に固定したいので 32byte シードを localStorage に永続する
// （リロード・再起動でも同じ peerId を保つ＝再接続・既知ピアの整合が保てる）。
// DID の秘密鍵シード（hvs.identity）とは別物・別保管。

import { generateKeyPairFromSeed } from "@libp2p/crypto/keys";
import type { Ed25519PrivateKey } from "@libp2p/interface";
import { seedFromBase64, seedToBase64 } from "../identity-crypto";

/** 端末 transport 鍵シード（base64・32byte）の localStorage キー。 */
const DEVICE_KEY_SEED = "hvs.deviceKeySeed";

/**
 * この端末の libp2p transport 秘密鍵を返す。初回は 32byte のランダムシードを
 * 生成して localStorage に永続し、以降は同じシードから決定的に復元する
 * （＝端末の peerId が固定される）。DID 鍵とは独立。
 */
export async function loadOrCreateDeviceTransportKey(): Promise<Ed25519PrivateKey> {
  return generateKeyPairFromSeed("Ed25519", loadOrCreateDeviceSeed());
}

/** 端末鍵シードを取得（無ければ生成して永続）。 */
function loadOrCreateDeviceSeed(): Uint8Array {
  const stored = localStorage.getItem(DEVICE_KEY_SEED);
  if (stored) {
    try {
      const seed = seedFromBase64(stored);
      if (seed.length === 32) return seed;
    } catch {
      // 壊れていれば作り直す。
    }
  }
  const seed = new Uint8Array(32);
  crypto.getRandomValues(seed);
  localStorage.setItem(DEVICE_KEY_SEED, seedToBase64(seed));
  return seed;
}
