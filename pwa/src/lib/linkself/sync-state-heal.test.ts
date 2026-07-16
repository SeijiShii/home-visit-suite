// 同期状態の自己修復（docs/wants/01_共通基盤.md「同期状態の自己修復」）のテスト。
// iOS「ホーム画面に追加」等でストレージが部分コピーされると、localStorage の
// 同期状態（scopedTables / sharedRecords）だけが残り OPFS のグループ DB が空、
// という食い違いが起きる。DB が新規なのにフラグが残っている場合は破棄して
// 初回一括配送（includeExisting）と全量 catch-up をやり直させる。

import { beforeEach, describe, expect, it } from "vitest";
import { nsKey, repoPrefix } from "../group-slots";
import { healDivergedSyncState } from "./sync-state-heal";

/** sqlite_master の応答だけを差し替えられる SqlDatabase の代役。 */
function fakeDb(tableNames: string[]): {
  query(
    sql: string,
    params?: unknown[],
  ): Promise<Array<Record<string, unknown>>>;
} {
  return {
    async query(sql: string) {
      if (!sql.includes("sqlite_master")) {
        throw new Error(`unexpected query: ${sql}`);
      }
      return tableNames.map((name) => ({ name }));
    },
  };
}

const SLOT = "g-test01";

describe("healDivergedSyncState", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("clears stale scopedTables + sharedRecords when the DB is brand new", async () => {
    localStorage.setItem(nsKey(SLOT, "scopedTables"), '["users","regions"]');
    localStorage.setItem(nsKey(SLOT, "sharedRecords"), "{}");

    const healed = await healDivergedSyncState(fakeDb([]), SLOT);

    expect(healed).toBe(true);
    expect(localStorage.getItem(nsKey(SLOT, "scopedTables"))).toBeNull();
    expect(localStorage.getItem(nsKey(SLOT, "sharedRecords"))).toBeNull();
  });

  it("heals when only one of the sync-state keys is present", async () => {
    localStorage.setItem(nsKey(SLOT, "sharedRecords"), "{}");

    const healed = await healDivergedSyncState(fakeDb([]), SLOT);

    expect(healed).toBe(true);
    expect(localStorage.getItem(nsKey(SLOT, "sharedRecords"))).toBeNull();
  });

  it("keeps membershipEpochs and networkId (rollback guard / rewiring)", async () => {
    localStorage.setItem(nsKey(SLOT, "scopedTables"), '["users"]');
    localStorage.setItem(nsKey(SLOT, "membershipEpochs"), '{"net-1":3}');
    localStorage.setItem(nsKey(SLOT, "networkId"), "net-1");

    await healDivergedSyncState(fakeDb([]), SLOT);

    expect(localStorage.getItem(nsKey(SLOT, "membershipEpochs"))).toBe(
      '{"net-1":3}',
    );
    expect(localStorage.getItem(nsKey(SLOT, "networkId"))).toBe("net-1");
  });

  it("does nothing on a truly fresh install (new DB, no flags)", async () => {
    const healed = await healDivergedSyncState(fakeDb([]), SLOT);
    expect(healed).toBe(false);
  });

  it("does nothing when the DB already has tables (flags are legitimate)", async () => {
    localStorage.setItem(nsKey(SLOT, "scopedTables"), '["users"]');
    localStorage.setItem(nsKey(SLOT, "sharedRecords"), "{}");

    const healed = await healDivergedSyncState(fakeDb(["users"]), SLOT);

    expect(healed).toBe(false);
    expect(localStorage.getItem(nsKey(SLOT, "scopedTables"))).toBe('["users"]');
    expect(localStorage.getItem(nsKey(SLOT, "sharedRecords"))).toBe("{}");
  });

  it("also clears legacy migration source keys (they describe the same lost DB)", async () => {
    localStorage.setItem(nsKey(SLOT, "scopedTables"), '["users"]');
    // 旧 localStorage リポジトリデータ（SQL 移行後の安全弁残置）。残すと
    // 「テーブルが空なら移行」が再発火し、includeExisting の新タイムスタンプ
    // 配送でグループ全体を巻き戻す（learned-review 2026-07-16 high 所見）。
    localStorage.setItem(
      `${repoPrefix(SLOT)}:region:regions`,
      '[["r1",{"id":"r1"}]]',
    );
    localStorage.setItem(
      `${repoPrefix(SLOT)}:user:users`,
      '[["u1",{"id":"u1"}]]',
    );
    localStorage.setItem(`${repoPrefix(SLOT)}:map.network`, "{}");

    const healed = await healDivergedSyncState(fakeDb([]), SLOT);

    expect(healed).toBe(true);
    expect(
      localStorage.getItem(`${repoPrefix(SLOT)}:region:regions`),
    ).toBeNull();
    expect(localStorage.getItem(`${repoPrefix(SLOT)}:user:users`)).toBeNull();
    expect(localStorage.getItem(`${repoPrefix(SLOT)}:map.network`)).toBeNull();
  });

  it("keeps live (unmigrated) repo data such as invitations", async () => {
    localStorage.setItem(nsKey(SLOT, "scopedTables"), '["users"]');
    // invitations / availablePeriod 系は SQL 未移行＝localStorage が現役 SoT。
    localStorage.setItem(
      `${repoPrefix(SLOT)}:user:invitations`,
      '[["i1",{"id":"i1"}]]',
    );

    await healDivergedSyncState(fakeDb([]), SLOT);

    expect(localStorage.getItem(`${repoPrefix(SLOT)}:user:invitations`)).toBe(
      '[["i1",{"id":"i1"}]]',
    );
  });

  it("leaves other slots' sync state untouched", async () => {
    localStorage.setItem(nsKey(SLOT, "scopedTables"), '["users"]');
    localStorage.setItem(nsKey("g-other", "scopedTables"), '["users"]');

    await healDivergedSyncState(fakeDb([]), SLOT);

    expect(localStorage.getItem(nsKey("g-other", "scopedTables"))).toBe(
      '["users"]',
    );
  });

  it("returns false instead of throwing when the DB query fails", async () => {
    const broken = {
      async query(): Promise<Array<Record<string, unknown>>> {
        throw new Error("db is closed");
      },
    };
    localStorage.setItem(nsKey(SLOT, "scopedTables"), '["users"]');

    await expect(healDivergedSyncState(broken, SLOT)).resolves.toBe(false);
    // 判定不能時はフラグを保持する（誤破棄で includeExisting 再実行を誘発しない）
    expect(localStorage.getItem(nsKey(SLOT, "scopedTables"))).toBe('["users"]');
  });
});
