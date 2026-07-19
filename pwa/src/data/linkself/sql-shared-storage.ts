// groupshare 共有レコード（catch-up 高水位・LWW 判定材料・catch-up 応答の
// 再送元）の SQL 永続ストア。
//
// 旧 LocalStorageSharedStorage は「users/member_tags 程度の規模」を前提に
// localStorage へ全量 JSON 保存し、quota 超過を黙って握りつぶしていた。
// 2026-07-16 の全テーブル移行で map_* 等の大容量データが通るようになり quota を
// 超えると、リロード後の共有レコード集合が欠損し、応答側として catch-up
// （完全 catch-up 含む）でも欠損分を再送できなくなる（docs/wants/01
// 「共有レコードストアの SQL 化」）。グループ DB（OPFS SQLite）に移すことで
// 実質無制限の容量とし、iOS 部分コピー（localStorage だけ残り DB が消える）でも
// ドメインデータと共有レコードが常に同一世代で揃う。
//
// 旧 localStorage ストアは初回アクセス時に一度きり移行し、キーを削除して
// quota を解放する（タイムスタンプ保持・既存の新しい SQL 行は上書きしない）。

import type { SharedRecord, SharedStorage, SqlDatabase } from "@linkself/core";

const TABLE = "shared_records";

/** LocalStorageSharedStorage の永続形（移行読み取り用）。 */
interface LegacyStored {
  id: string;
  channel: string;
  topic: string;
  groupId: string;
  did: string;
  timestamp: number;
  body: string | null;
  deleted: boolean;
}

type LegacyMap = Record<string, Record<string, LegacyStored>>;

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

function rowToRecord(row: Record<string, unknown>): SharedRecord {
  return {
    channel: String(row.channel),
    id: String(row.id),
    topic: String(row.topic ?? ""),
    groupId: String(row.group_id ?? ""),
    did: String(row.did ?? ""),
    timestamp: Number(row.timestamp ?? 0),
    body: row.body == null ? null : base64ToBytes(String(row.body)),
    deleted: Number(row.deleted ?? 0) !== 0,
  };
}

export interface SqlSharedStorageOptions {
  /**
   * 旧 LocalStorageSharedStorage の保存キー。存在すれば初回アクセス時に
   * 一度きり SQL へ移行し、キーを削除して quota を解放する。
   */
  legacyLocalStorageKey?: string;
}

/** グループ DB（SQLite）永続の SharedStorage。 */
export class SqlSharedStorage implements SharedStorage {
  private ready: Promise<void> | null = null;

  constructor(
    private readonly db: SqlDatabase,
    private readonly opts: SqlSharedStorageOptions = {},
  ) {}

  /** テーブル作成＋旧 localStorage ストアの一度きり移行（初回のみ実行）。 */
  private ensure(): Promise<void> {
    if (this.ready == null) {
      // 失敗した init を Promise ごとキャッシュすると、一過性エラー 1 回で
      // 以後の全操作（受信適用・ミラー・catch-up 応答）が同一 rejection を
      // 返し続けて同期が無言停止する。失敗時はキャッシュを戻して次の操作で
      // 再試行できるようにする。
      this.ready = this.init().catch((e) => {
        this.ready = null;
        throw e;
      });
    }
    return this.ready;
  }

  private async init(): Promise<void> {
    await this.db.exec(
      `CREATE TABLE IF NOT EXISTS "${TABLE}" (
        channel TEXT NOT NULL,
        id TEXT NOT NULL,
        topic TEXT NOT NULL DEFAULT '',
        group_id TEXT NOT NULL DEFAULT '',
        did TEXT NOT NULL DEFAULT '',
        timestamp INTEGER NOT NULL DEFAULT 0,
        body TEXT,
        deleted INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (channel, id)
      )`,
    );
    // 移行の失敗でストア本体を道連れにしない（キーは残るため次回起動で再試行）。
    try {
      await this.migrateLegacy();
    } catch (e) {
      console.warn("SqlSharedStorage: legacy migration failed (will retry)", e);
    }
  }

  private async migrateLegacy(): Promise<void> {
    const key = this.opts.legacyLocalStorageKey;
    if (!key) return;
    let raw: string | null = null;
    try {
      raw = localStorage.getItem(key);
    } catch {
      return; // 非ブラウザ環境
    }
    if (raw == null) return;
    let map: LegacyMap;
    try {
      const parsed: unknown = JSON.parse(raw);
      if (parsed == null || typeof parsed !== "object") {
        throw new Error("not an object");
      }
      map = parsed as LegacyMap;
    } catch {
      // 壊れた旧データは移行不能。キーだけ消して quota を解放する。
      localStorage.removeItem(key);
      return;
    }
    // 既存の新しい SQL 行は上書きしない（旧ストアは陳腐コピーの可能性がある）。
    for (const recs of Object.values(map)) {
      for (const s of Object.values(recs)) {
        await this.db.exec(
          `INSERT INTO "${TABLE}"
             (channel, id, topic, group_id, did, timestamp, body, deleted)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(channel, id) DO UPDATE SET
             topic = excluded.topic,
             group_id = excluded.group_id,
             did = excluded.did,
             timestamp = excluded.timestamp,
             body = excluded.body,
             deleted = excluded.deleted
           WHERE excluded.timestamp > "${TABLE}".timestamp`,
          [
            s.channel,
            s.id,
            s.topic ?? "",
            s.groupId ?? "",
            s.did ?? "",
            s.timestamp ?? 0,
            s.body,
            s.deleted ? 1 : 0,
          ],
        );
      }
    }
    // 移行が全行成功したときだけキーを削除する（失敗時は次回起動で再試行）。
    localStorage.removeItem(key);
  }

  async putShared(record: SharedRecord): Promise<void> {
    await this.ensure();
    await this.db.exec(
      `INSERT OR REPLACE INTO "${TABLE}"
         (channel, id, topic, group_id, did, timestamp, body, deleted)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        record.channel,
        record.id,
        record.topic,
        record.groupId,
        record.did,
        record.timestamp,
        record.body == null ? null : bytesToBase64(record.body),
        record.deleted ? 1 : 0,
      ],
    );
  }

  async getShared(channel: string, id: string): Promise<SharedRecord | null> {
    await this.ensure();
    const rows = await this.db.query(
      `SELECT * FROM "${TABLE}" WHERE channel = ? AND id = ?`,
      [channel, id],
    );
    return rows.length === 0 ? null : rowToRecord(rows[0]!);
  }

  async getTimestamp(channel: string, id: string): Promise<number> {
    await this.ensure();
    const rows = await this.db.query(
      `SELECT timestamp FROM "${TABLE}" WHERE channel = ? AND id = ?`,
      [channel, id],
    );
    return rows.length === 0 ? 0 : Number(rows[0]!.timestamp ?? 0);
  }

  async deleteShared(channel: string, id: string): Promise<void> {
    await this.ensure();
    await this.db.exec(`DELETE FROM "${TABLE}" WHERE channel = ? AND id = ?`, [
      channel,
      id,
    ]);
  }

  async listByChannel(channel: string): Promise<SharedRecord[]> {
    await this.ensure();
    const rows = await this.db.query(
      `SELECT * FROM "${TABLE}" WHERE channel = ?`,
      [channel],
    );
    return rows.map(rowToRecord);
  }

  async listByGroup(groupId: string): Promise<SharedRecord[]> {
    await this.ensure();
    const rows = await this.db.query(
      `SELECT * FROM "${TABLE}" WHERE group_id = ?`,
      [groupId],
    );
    return rows.map(rowToRecord);
  }

  async listByChannelAndTopic(
    channel: string,
    topic: string,
  ): Promise<SharedRecord[]> {
    await this.ensure();
    const rows = await this.db.query(
      `SELECT * FROM "${TABLE}" WHERE channel = ? AND topic = ?`,
      [channel, topic],
    );
    return rows.map(rowToRecord);
  }

  async deleteExpired(channel: string, before: number): Promise<number> {
    await this.ensure();
    const rows = await this.db.query(
      `SELECT COUNT(*) AS n FROM "${TABLE}" WHERE channel = ? AND timestamp < ?`,
      [channel, before],
    );
    const n = Number(rows[0]?.n ?? 0);
    if (n > 0) {
      await this.db.exec(
        `DELETE FROM "${TABLE}" WHERE channel = ? AND timestamp < ?`,
        [channel, before],
      );
    }
    return n;
  }
}
