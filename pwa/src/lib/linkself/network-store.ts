// グループ（LinkSelf ネットワーク）実体の localStorage 永続ストア。
// 既定の MemNetworkStore はリロードで消え、管理者が発行済み招待の networkId が
// 「存在しないネットワーク」を指して参加が network_not_found で拒否されるため、
// メンバー・ロール表をタブのリロードをまたいで保持する。単回使用の招待ノンスも
// 同様に永続化する（リロードで消えると使用済み招待の再利用を許してしまう）。
// LinkSelf 本統合（Phase C / M5）で MyDB-backed ストアへ移行する暫定ブリッジ
// （docs/wants/01_共通基盤.md「暫定ブリッジ」）。

import type { ConsumedNonceStore, Network, NetworkStore } from "@linkself/core";
import { NetworkError } from "@linkself/core";

const NETWORKS_KEY = "hvs.networks";
const NONCES_KEY = "hvs.consumedInviteNonces";

function loadMap(key: string): Record<string, Network> {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return {};
    return JSON.parse(raw) as Record<string, Network>;
  } catch {
    return {};
  }
}

function saveMap(key: string, map: Record<string, Network>): void {
  try {
    localStorage.setItem(key, JSON.stringify(map));
  } catch {
    // 容量超過等。ネットワーク実体は小さいため実質発生しない。
  }
}

/** localStorage 永続の NetworkStore。 */
export class LocalStorageNetworkStore implements NetworkStore {
  constructor(private readonly key: string = NETWORKS_KEY) {}

  async createNetwork(n: Network): Promise<string> {
    const id = crypto.randomUUID();
    const map = loadMap(this.key);
    map[id] = { ...n, id };
    saveMap(this.key, map);
    return id;
  }

  async getNetwork(id: string): Promise<Network | null> {
    const n = loadMap(this.key)[id];
    return n ?? null;
  }

  async updateNetwork(id: string, n: Network): Promise<void> {
    const map = loadMap(this.key);
    if (!map[id]) throw new NetworkError("network_not_found");
    map[id] = { ...n, id };
    saveMap(this.key, map);
  }

  async deleteNetwork(id: string): Promise<void> {
    const map = loadMap(this.key);
    delete map[id];
    saveMap(this.key, map);
  }

  async listForMember(memberDID: string): Promise<string[]> {
    return Object.values(loadMap(this.key))
      .filter((n) => n.members.includes(memberDID))
      .map((n) => n.id);
  }

  async putNetwork(n: Network): Promise<void> {
    const map = loadMap(this.key);
    map[n.id] = { ...n };
    saveMap(this.key, map);
  }
}

/** localStorage 永続の使用済み招待ノンス表（単回使用の担保）。 */
export class LocalStorageConsumedNonceStore implements ConsumedNonceStore {
  constructor(private readonly key: string = NONCES_KEY) {}

  private load(): string[] {
    try {
      const raw = localStorage.getItem(this.key);
      if (!raw) return [];
      return JSON.parse(raw) as string[];
    } catch {
      return [];
    }
  }

  async has(nonce: string): Promise<boolean> {
    return this.load().includes(nonce);
  }

  async add(nonce: string): Promise<void> {
    const list = this.load();
    if (!list.includes(nonce)) {
      list.push(nonce);
      try {
        localStorage.setItem(this.key, JSON.stringify(list));
      } catch {
        // ignore
      }
    }
  }
}
