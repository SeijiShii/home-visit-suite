// membership epoch の localStorage 永続ストア（と旧・共有レコードストア）。
//
// - LocalStorageEpochStore: NetworkMetaTracker の適用済み epoch。リロードで 0 に
//   戻ると古い membership スナップショットが巻き戻りとして適用され得る。現役。
// - LocalStorageSharedStorage: **2026-07-19 に data/linkself/sql-shared-storage.ts
//   （グループ DB 永続）へ置換済み**。localStorage 全量 JSON 保存は quota 超過を
//   握りつぶし、map_* 全面移行後に応答側の共有レコード集合が欠損した
//   （docs/wants/01「共有レコードストアの SQL 化」）。旧キーの一度きり移行の
//   読み取り形式（StoredShared/SharedMap）の定義元として残置。新規使用は不可。
//
// docs/wants/01_共通基盤.md「同期スコープ」/「共有レコードストアの SQL 化」

import type { EpochStore, SharedRecord, SharedStorage } from "@linkself/core";

const SHARED_KEY = "hvs.sharedRecords";
const EPOCHS_KEY = "hvs.membershipEpochs";

/** 永続形（body は base64。null はそのまま）。 */
interface StoredShared {
  id: string;
  channel: string;
  topic: string;
  groupId: string;
  did: string;
  timestamp: number;
  body: string | null;
  deleted: boolean;
}

function toStored(rec: SharedRecord): StoredShared {
  return {
    ...rec,
    body: rec.body == null ? null : bytesToBase64(rec.body),
  };
}

function fromStored(s: StoredShared): SharedRecord {
  return { ...s, body: s.body == null ? null : base64ToBytes(s.body) };
}

function bytesToBase64(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

type SharedMap = Record<string, Record<string, StoredShared>>; // channel → id → record

/**
 * localStorage 永続の SharedStorage（墓石含む共有レコード + タイムスタンプ）。
 * 全体をメモリにキャッシュし、読みはキャッシュ・書きは write-through にする
 * （SQL ミラーは書き込みごとに全行を put するため、毎操作の全量 JSON parse は
 * メインスレッドを圧迫する = 管理者タブが重くなる）。
 */
export class LocalStorageSharedStorage implements SharedStorage {
  private cache: SharedMap | null = null;
  private saveTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(private readonly key: string = SHARED_KEY) {
    // タブ破棄時に未書き込み分を確実に落とす（デバウンス書き込みの取りこぼし防止）。
    try {
      globalThis.addEventListener?.("pagehide", () => this.flush());
    } catch {
      // 非ブラウザ環境は都度 flush のみ
    }
  }

  private map(): SharedMap {
    if (this.cache == null) {
      try {
        const raw = localStorage.getItem(this.key);
        this.cache = raw ? (JSON.parse(raw) as SharedMap) : {};
      } catch {
        this.cache = {};
      }
    }
    return this.cache;
  }

  /**
   * 書き込みは 200ms で合流する。SQL ミラーは 1 回の書き込みで全行を put
   * するため、行ごとの全量 stringify がメインスレッドを圧迫していた。
   * 最悪クラッシュ時に直近分を失っても catch-up 同期が回復する（表示・
   * 同期用キャッシュであり一次データではない）。
   */
  private save(): void {
    if (this.saveTimer != null) return;
    this.saveTimer = setTimeout(() => this.flush(), 200);
  }

  private flush(): void {
    if (this.saveTimer != null) {
      clearTimeout(this.saveTimer);
      this.saveTimer = null;
    }
    if (this.cache == null) return;
    try {
      localStorage.setItem(this.key, JSON.stringify(this.cache));
    } catch {
      // 容量超過等。users/member_tags 規模では実質発生しない。
    }
  }

  async putShared(record: SharedRecord): Promise<void> {
    const map = this.map();
    (map[record.channel] ??= {})[record.id] = toStored(record);
    this.save();
  }

  async getShared(channel: string, id: string): Promise<SharedRecord | null> {
    const s = this.map()[channel]?.[id];
    return s == null ? null : fromStored(s);
  }

  async getTimestamp(channel: string, id: string): Promise<number> {
    return this.map()[channel]?.[id]?.timestamp ?? 0;
  }

  async deleteShared(channel: string, id: string): Promise<void> {
    const map = this.map();
    if (map[channel]) {
      delete map[channel]![id];
      this.save();
    }
  }

  async listByChannel(channel: string): Promise<SharedRecord[]> {
    return Object.values(this.map()[channel] ?? {}).map(fromStored);
  }

  async listByGroup(groupId: string): Promise<SharedRecord[]> {
    const out: SharedRecord[] = [];
    for (const recs of Object.values(this.map())) {
      for (const s of Object.values(recs)) {
        if (s.groupId === groupId) out.push(fromStored(s));
      }
    }
    return out;
  }

  async listByChannelAndTopic(
    channel: string,
    topic: string,
  ): Promise<SharedRecord[]> {
    return (await this.listByChannel(channel)).filter((r) => r.topic === topic);
  }

  async deleteExpired(channel: string, before: number): Promise<number> {
    const recs = this.map()[channel];
    if (!recs) return 0;
    let n = 0;
    for (const [id, s] of Object.entries(recs)) {
      if (s.timestamp < before) {
        delete recs[id];
        n++;
      }
    }
    if (n > 0) this.save();
    return n;
  }
}

/** localStorage 永続の EpochStore（membership スナップショットの巻き戻り防止）。 */
export class LocalStorageEpochStore implements EpochStore {
  constructor(private readonly key: string = EPOCHS_KEY) {}

  private load(): Record<string, number> {
    try {
      const raw = localStorage.getItem(this.key);
      return raw ? (JSON.parse(raw) as Record<string, number>) : {};
    } catch {
      return {};
    }
  }

  get(networkId: string): number {
    return this.load()[networkId] ?? 0;
  }

  set(networkId: string, epoch: number): void {
    const map = this.load();
    map[networkId] = epoch;
    try {
      localStorage.setItem(this.key, JSON.stringify(map));
    } catch {
      // ignore
    }
  }
}
