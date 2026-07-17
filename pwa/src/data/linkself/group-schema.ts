// グループドメインデータ（ScopeNetwork 対象）の MyDB SQL スキーマ。
// 全テーブルを (id TEXT PRIMARY KEY, data TEXT) の JSON 行形式で持つ:
// - 先頭列 id が主キー = wireSqlSync が先頭列値をレコード ID として読み戻す規約
// - data はドメインモデルの JSON 直列化（タイムスタンプは ISO 文字列で Date を含まない）
// - 行単位の LWW で ScopeNetwork 同期される（docs/wants/01「同期スコープ」）
//
// version は同一 SQLite ファイル（グループ DB）を共有する他リポジトリと重複させない
// （1 = linkself-personal-repository, 2 = linkself-user-repository）。
// SqlProxy.migrate は version 毎に適用記録するため、適用順序に依存しない。

import type { MyDB } from "@linkself/core";
import { USER_SYNC_TABLES } from "./linkself-user-repository";

// version 3 で作成したテーブル集合（凍結。適用済み DB では v3 は再実行されない
// ため、以後のテーブル追加はここに足さず新しい version のマイグレーションで行う）。
const V3_TABLES = [
  "regions",
  "parent_areas",
  "areas",
  "places",
  "checkouts",
  "checkout_invitations",
  "visit_records",
  "visit_record_edits",
  "coverages",
  "notifications",
  "requests",
  "audit_log",
  "map_vertices",
  "map_edges",
  "map_polygons",
] as const;

/** JSON 行形式のグループドメインテーブル（users/member_tags 以外）。 */
export const GROUP_DOMAIN_TABLES = [
  ...V3_TABLES,
  // v4: 管理者宛フィードバック（docs/wants/07「フィードバック」）
  "feedback",
] as const;

export type GroupDomainTable = (typeof GROUP_DOMAIN_TABLES)[number];

/** ScopeNetwork 化する全テーブル（docs/wants/01 同期スコープ表）。 */
export const GROUP_SYNC_TABLES: readonly string[] = [
  ...USER_SYNC_TABLES,
  ...GROUP_DOMAIN_TABLES,
];

const createTableSql = (t: string) =>
  `CREATE TABLE IF NOT EXISTS ${t} (id TEXT PRIMARY KEY, data TEXT NOT NULL);`;

const GROUP_DOMAIN_MIGRATIONS = [
  { version: 3, sql: V3_TABLES.map(createTableSql).join("\n") },
  { version: 4, sql: createTableSql("feedback") },
];

// MyDB インスタンス毎に一度だけ migrate する（各リポジトリ・MapBinding が共有）。
const migrated = new WeakMap<MyDB, Promise<void>>();

/** グループドメインテーブルのスキーマを適用する（同一 MyDB には一度だけ）。 */
export function ensureGroupSchema(db: MyDB): Promise<void> {
  let p = migrated.get(db);
  if (!p) {
    p = db.migrate(GROUP_DOMAIN_MIGRATIONS);
    migrated.set(db, p);
  }
  return p;
}

/** JSON 行テーブルの全行を読み、data をパースして返す（壊れた行は無視）。 */
export async function listRows<V>(
  db: MyDB,
  table: GroupDomainTable,
): Promise<V[]> {
  await ensureGroupSchema(db);
  const rows = await db.query(`SELECT data FROM ${table}`);
  const out: V[] = [];
  for (const r of rows) {
    try {
      out.push(JSON.parse(String(r.data)) as V);
    } catch {
      // 壊れた行は読み飛ばす（表示不能にしない）
    }
  }
  return out;
}

/** JSON 行テーブルから 1 行を読む。 */
export async function getRow<V>(
  db: MyDB,
  table: GroupDomainTable,
  id: string,
): Promise<V | null> {
  await ensureGroupSchema(db);
  const rows = await db.query(`SELECT data FROM ${table} WHERE id = ?`, [id]);
  if (rows.length === 0) return null;
  try {
    return JSON.parse(String(rows[0]!.data)) as V;
  } catch {
    return null;
  }
}

/** JSON 行テーブルへ upsert する（書き込みは wireSqlSync で同期にミラーされる）。 */
export async function putRow(
  db: MyDB,
  table: GroupDomainTable,
  id: string,
  value: unknown,
): Promise<void> {
  await ensureGroupSchema(db);
  await db.exec(`INSERT OR REPLACE INTO ${table} (id, data) VALUES (?, ?)`, [
    id,
    JSON.stringify(value),
  ]);
}

/** JSON 行テーブルから 1 行を物理削除する（同期上は墓石になり伝播する）。 */
export async function deleteRow(
  db: MyDB,
  table: GroupDomainTable,
  id: string,
): Promise<void> {
  await ensureGroupSchema(db);
  await db.exec(`DELETE FROM ${table} WHERE id = ?`, [id]);
}
