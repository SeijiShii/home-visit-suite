// 旧 localStorage 実装（InMemory リポジトリ + PersistentMap / LocalStorageMapBinding）
// から MyDB SQL のグループドメインテーブルへの一度きり移行。
//
// SQL 側テーブルが空のときだけ旧データをコピーする（users/member_tags の移行と
// 同じ方針）。移行後も旧 localStorage は消さない（SQL 側が非空になるため二重移行は
// 起きず、ロールバック時の安全弁として残す）。
// この移行は ScopeNetwork 昇格（includeExisting = 初回のみ）より前に実行すること —
// 昇格時の一括配送に移行済みデータが乗る。

import type { MyDB } from "@linkself/core";
import {
  ensureGroupSchema,
  putRow,
  type GroupDomainTable,
} from "./group-schema";

/** PersistentMap の保存形式（[key, value][]）を読む。無ければ null。 */
function readLegacyEntries(key: string): Array<[string, unknown]> | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as Array<[string, unknown]>) : null;
  } catch {
    return null;
  }
}

async function tableIsEmpty(
  db: MyDB,
  table: GroupDomainTable,
): Promise<boolean> {
  const rows = await db.query(`SELECT COUNT(*) AS n FROM ${table}`);
  return Number(rows[0]?.n ?? 0) === 0;
}

/** 旧キー（storagePrefix 相対）→ SQL テーブルの対応。 */
const LEGACY_MAP_KEYS: ReadonlyArray<[string, GroupDomainTable]> = [
  ["region:regions", "regions"],
  ["region:parentAreas", "parent_areas"],
  ["region:areas", "areas"],
  ["place:places", "places"],
  ["checkout:checkouts", "checkouts"],
  ["checkout:invitations", "checkout_invitations"],
  ["checkout:visitRecords", "visit_records"],
  ["checkout:visitRecordEdits", "visit_record_edits"],
  ["coverage:coverages", "coverages"],
  ["notification:notifications", "notifications"],
  ["notification:requests", "requests"],
  ["notification:auditLogs", "audit_log"],
  // feedback は SQL テーブルも LinkSelfNotificationRepository の読み書きも
  // あるのに、ここだけ抜けていた（2026-07-20 修正）。抜けていた間は、旧実装で
  // 送受信したフィードバックが LinkSelf 版への移行時に無言で消えていた。
  ["notification:feedback", "feedback"],
];

/**
 * 旧データ移行のソースキー（storagePrefix 相対）の全一覧。
 * 同期状態の自己修復（sync-state-heal）が食い違い検出時にまとめて破棄する:
 * これらは失われた旧 DB と同世代の凍結データであり、残すと「テーブルが空なら
 * 移行」判定が再発火し、includeExisting の新タイムスタンプ一括配送で他端末の
 * 新しい状態＝グループ全体を巻き戻す（docs/wants/01「同期状態の自己修復」）。
 * `user:users` / `user:tags` は linkself-services 側の users/member_tags 移行の
 * ソース（InMemoryUserRepository の永続面）。SQL 未移行で localStorage が現役の
 * リポジトリ（invitations / availablePeriod 系）は含めない。
 */
export const LEGACY_MIGRATION_SOURCE_SUFFIXES: readonly string[] = [
  ...LEGACY_MAP_KEYS.map(([suffix]) => suffix),
  "map.network",
  "user:users",
  "user:tags",
];

/**
 * 旧 localStorage のグループドメインデータを MyDB SQL へ一度きり移行する。
 * storagePrefix はアクティブスロットのリポジトリプレフィクス（例: `hvs.g.<slotId>`）。
 */
export async function migrateLegacyGroupData(
  db: MyDB,
  storagePrefix: string | undefined,
): Promise<void> {
  if (!storagePrefix) return; // 非永続（テスト）構成では移行対象なし
  await ensureGroupSchema(db);

  for (const [suffix, table] of LEGACY_MAP_KEYS) {
    try {
      const entries = readLegacyEntries(`${storagePrefix}:${suffix}`);
      if (!entries || entries.length === 0) continue;
      if (!(await tableIsEmpty(db, table))) continue;
      for (const [key, value] of entries) {
        const id =
          value != null &&
          typeof value === "object" &&
          typeof (value as { id?: unknown }).id === "string"
            ? (value as { id: string }).id
            : key;
        await putRow(db, table, id, value);
      }
    } catch (e) {
      console.warn(`linkself: legacy migration failed for ${table}`, e);
    }
  }

  // ポリゴンネットワーク（単一 JSON blob → エンティティ行）。
  try {
    const raw = localStorage.getItem(`${storagePrefix}:map.network`);
    if (raw) {
      const network = JSON.parse(raw) as Partial<{
        vertices: Array<{ id: string }>;
        edges: Array<{ id: string }>;
        polygons: Array<{ id: string }>;
      }>;
      const parts: ReadonlyArray<
        [GroupDomainTable, Array<{ id: string }> | undefined]
      > = [
        ["map_vertices", network.vertices],
        ["map_edges", network.edges],
        ["map_polygons", network.polygons],
      ];
      const allEmpty = (
        await Promise.all(parts.map(([t]) => tableIsEmpty(db, t)))
      ).every(Boolean);
      if (allEmpty) {
        for (const [table, entities] of parts) {
          for (const e of entities ?? []) {
            if (!e || typeof e.id !== "string" || e.id === "") continue;
            await putRow(db, table, e.id, e);
          }
        }
      }
    }
  } catch (e) {
    console.warn("linkself: legacy map network migration failed", e);
  }
}
