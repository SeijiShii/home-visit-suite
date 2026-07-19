// SQL 永続の SharedStorage の検証。
// localStorage 実装（LocalStorageSharedStorage）は quota 超過を黙って握りつぶし、
// 応答側の共有レコード集合が欠損して catch-up（完全含む）でも再送不能になる。
// グループ DB（OPFS SQLite）へ移し、旧 localStorage 分は一度きり移行して
// quota を解放する（docs/wants/01「共有レコードストアの SQL 化」）。
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { SqliteWasmDatabase, type SharedRecord } from "@linkself/core";
import { SqlSharedStorage } from "./sql-shared-storage";

const enc = new TextEncoder();
const dec = new TextDecoder();

function rec(partial: Partial<SharedRecord> & { id: string }): SharedRecord {
  return {
    channel: "mydb:net-1:map_vertices",
    topic: "",
    groupId: "net-1",
    did: "did:a",
    timestamp: 100,
    body: enc.encode(`{"id":"${partial.id}"}`),
    deleted: false,
    ...partial,
  };
}

describe("SqlSharedStorage", () => {
  let db: SqliteWasmDatabase;
  let store: SqlSharedStorage;
  const LEGACY_KEY = "test.sharedRecords";

  beforeEach(async () => {
    db = await SqliteWasmDatabase.open(); // in-memory
    store = new SqlSharedStorage(db, { legacyLocalStorageKey: LEGACY_KEY });
  });

  afterEach(() => {
    localStorage.removeItem(LEGACY_KEY);
  });

  it("put/get/timestamp/delete の往復", async () => {
    await store.putShared(rec({ id: "a", timestamp: 111 }));
    const got = (await store.getShared("mydb:net-1:map_vertices", "a"))!;
    expect(got.timestamp).toBe(111);
    expect(dec.decode(got.body!)).toBe('{"id":"a"}');
    expect(await store.getTimestamp("mydb:net-1:map_vertices", "a")).toBe(111);
    expect(await store.getTimestamp("mydb:net-1:map_vertices", "nope")).toBe(0);
    await store.deleteShared("mydb:net-1:map_vertices", "a");
    expect(await store.getShared("mydb:net-1:map_vertices", "a")).toBeNull();
  });

  it("墓石（deleted, body null）を保持する", async () => {
    await store.putShared(
      rec({ id: "t", deleted: true, body: null, timestamp: 200 }),
    );
    const got = (await store.getShared("mydb:net-1:map_vertices", "t"))!;
    expect(got.deleted).toBe(true);
    expect(got.body).toBeNull();
  });

  it("listByChannel / listByGroup / listByChannelAndTopic", async () => {
    await store.putShared(rec({ id: "a" }));
    await store.putShared(rec({ id: "b", topic: "x" }));
    await store.putShared(rec({ id: "c", channel: "mydb:net-1:map_edges" }));
    await store.putShared(
      rec({ id: "d", channel: "mydb:net-2:users", groupId: "net-2" }),
    );
    expect(
      (await store.listByChannel("mydb:net-1:map_vertices"))
        .map((r) => r.id)
        .sort(),
    ).toEqual(["a", "b"]);
    expect((await store.listByGroup("net-1")).map((r) => r.id).sort()).toEqual([
      "a",
      "b",
      "c",
    ]);
    expect(
      (await store.listByChannelAndTopic("mydb:net-1:map_vertices", "x")).map(
        (r) => r.id,
      ),
    ).toEqual(["b"]);
  });

  it("deleteExpired は timestamp < before を消し件数を返す", async () => {
    await store.putShared(rec({ id: "old", timestamp: 10 }));
    await store.putShared(rec({ id: "new", timestamp: 100 }));
    expect(await store.deleteExpired("mydb:net-1:map_vertices", 50)).toBe(1);
    expect(
      (await store.listByChannel("mydb:net-1:map_vertices")).map((r) => r.id),
    ).toEqual(["new"]);
  });

  it("旧 localStorage ストアを初回アクセス時に一度きり移行し、キーを削除して quota を解放する", async () => {
    // LocalStorageSharedStorage の永続形式（channel → id → StoredShared、body は base64）
    const legacy = {
      "mydb:net-1:map_vertices": {
        v1: {
          id: "v1",
          channel: "mydb:net-1:map_vertices",
          topic: "",
          groupId: "net-1",
          did: "did:a",
          timestamp: 42,
          body: btoa('{"id":"v1"}'),
          deleted: false,
        },
      },
    };
    localStorage.setItem(LEGACY_KEY, JSON.stringify(legacy));
    const fresh = new SqlSharedStorage(db, {
      legacyLocalStorageKey: LEGACY_KEY,
    });
    const got = (await fresh.getShared("mydb:net-1:map_vertices", "v1"))!;
    expect(got.timestamp).toBe(42);
    expect(dec.decode(got.body!)).toBe('{"id":"v1"}');
    expect(localStorage.getItem(LEGACY_KEY)).toBeNull();
  });

  it("init の一過性失敗を固定化せず次の操作で再試行する", async () => {
    // 失敗した init を Promise ごとキャッシュすると、以後の全操作（受信適用・
    // ミラー・catch-up 応答）が同一 rejection を返し続け同期が無言停止する。
    let failNext = true;
    const flaky = {
      exec: async (sql: string, params?: unknown[]) => {
        if (failNext) {
          failNext = false;
          throw new Error("transient sqlite error");
        }
        await db.exec(sql, params);
      },
      query: (sql: string, params?: unknown[]) => db.query(sql, params),
    };
    const s = new SqlSharedStorage(
      flaky as unknown as ConstructorParameters<typeof SqlSharedStorage>[0],
    );
    await expect(s.putShared(rec({ id: "a" }))).rejects.toThrow();
    await s.putShared(rec({ id: "a", timestamp: 7 }));
    expect(await s.getTimestamp("mydb:net-1:map_vertices", "a")).toBe(7);
  });

  it("移行はタイムスタンプが新しい既存 SQL 行を上書きしない", async () => {
    await store.putShared(rec({ id: "v1", timestamp: 500 }));
    localStorage.setItem(
      LEGACY_KEY,
      JSON.stringify({
        "mydb:net-1:map_vertices": {
          v1: {
            id: "v1",
            channel: "mydb:net-1:map_vertices",
            topic: "",
            groupId: "net-1",
            did: "did:a",
            timestamp: 42,
            body: btoa('{"id":"stale"}'),
            deleted: false,
          },
        },
      }),
    );
    const fresh = new SqlSharedStorage(db, {
      legacyLocalStorageKey: LEGACY_KEY,
    });
    expect(await fresh.getTimestamp("mydb:net-1:map_vertices", "v1")).toBe(500);
  });
});
