// PersonalRepository の LinkSelf(MyDB SQL) 実装。
// アプリ設定（my_settings）と非表示 tip（hidden_tips）を MyDB の SQL テーブルに保存する。
// SQL 面は SqliteWasmDatabase（ブラウザでは OPFS SAHPool VFS）を裏に持つため、
// リロードをまたいで永続する。書き込みは wireSqlSync が devicesync へミラーするので、
// 将来 Phase C 相当の端末間同期（ScopeDevice）にもそのまま乗る
// （docs/wants/01_共通基盤.md「同期スコープ」）。
//
// ※ KV 面（MyDB.put/get）は MemDeviceStorage backed = インメモリで永続しないため、
//   設定は SQL 面に載せる（link-self には永続 DeviceStorage が未実装）。
//
// ノート/タグ/割り当てのドメインデータは当面 InMemory へ委譲する
// （localStorage 実装と同構造。ドメインデータの MyDB SQL 化は後続ステップ）。
//
// 注意: API キーは SQLite に平文で入る（利用者自身のキー・端末間共有は本人の端末のみ）。
// 秘匿情報の暗号化ストレージ化は後続で対応（docs/wants/01「秘密鍵の保管」と同様）。

import type { MyDB } from "@linkself/core";
import type {
  PersonalNote,
  PersonalTag,
  PersonalTagAssignment,
} from "../../domain/models/personal";
import type { PersonalRepository } from "../../domain/repositories/personal-repository";
import { InMemoryPersonalRepository } from "../inmemory/inmemory-personal-repository";

// 設定キー（my_settings.key）。
const K_LOCALE = "locale";
const K_AREA_RADIUS = "areaDetailRadiusKm";
const K_AI_PROVIDER = "aiProvider";
const K_AI_MODEL = "aiModel";
const K_AI_CONSENT = "aiMapImportConsent";
const K_AI_APIKEY_PREFIX = "aiApiKey/"; // aiApiKey/<provider>

// スキーマ。各テーブルの先頭列を主キーにする（wireSqlSync が devicesync へ
// ミラーする際、先頭列値をレコード ID として読み戻す規約に合わせる）。
const MIGRATIONS = [
  {
    version: 1,
    sql: `
      CREATE TABLE IF NOT EXISTS my_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS hidden_tips (key TEXT PRIMARY KEY);
    `,
  },
];

export class LinkSelfPersonalRepository implements PersonalRepository {
  // ノート/タグ/割り当ては当面インメモリに委譲（ドメインデータの SQL 化は後続ステップ）。
  private readonly inner = new InMemoryPersonalRepository();
  // マイグレーションは初回アクセス時に一度だけ実行する（コンストラクタは同期のため）。
  private migrated: Promise<void> | null = null;

  constructor(private readonly db: MyDB) {}

  private ensureMigrated(): Promise<void> {
    return (this.migrated ??= this.db.migrate(MIGRATIONS));
  }

  // ── 設定 KV ヘルパ（my_settings テーブル） ───────────────────
  private async getStr(key: string): Promise<string> {
    await this.ensureMigrated();
    const rows = await this.db.query(
      "SELECT value FROM my_settings WHERE key = ?",
      [key],
    );
    const v = rows[0]?.value;
    return v == null ? "" : String(v);
  }
  private async setStr(key: string, value: string): Promise<void> {
    await this.ensureMigrated();
    await this.db.exec(
      "INSERT OR REPLACE INTO my_settings (key, value) VALUES (?, ?)",
      [key, value],
    );
  }

  // ── ドメインデータ（委譲） ────────────────────────────────
  getPersonalNote(visitRecordId: string): Promise<PersonalNote | null> {
    return this.inner.getPersonalNote(visitRecordId);
  }
  savePersonalNote(note: PersonalNote): Promise<void> {
    return this.inner.savePersonalNote(note);
  }
  deletePersonalNote(id: string): Promise<void> {
    return this.inner.deletePersonalNote(id);
  }
  listPersonalTags(): Promise<PersonalTag[]> {
    return this.inner.listPersonalTags();
  }
  savePersonalTag(tag: PersonalTag): Promise<void> {
    return this.inner.savePersonalTag(tag);
  }
  deletePersonalTag(id: string): Promise<void> {
    return this.inner.deletePersonalTag(id);
  }
  listPersonalTagAssignments(
    visitRecordId: string,
  ): Promise<PersonalTagAssignment[]> {
    return this.inner.listPersonalTagAssignments(visitRecordId);
  }
  savePersonalTagAssignment(a: PersonalTagAssignment): Promise<void> {
    return this.inner.savePersonalTagAssignment(a);
  }
  deletePersonalTagAssignment(id: string): Promise<void> {
    return this.inner.deletePersonalTagAssignment(id);
  }

  // ── 非表示 tip（hidden_tips テーブル: キー1つ=1行） ──────────
  async getHiddenTipKeys(): Promise<string[]> {
    await this.ensureMigrated();
    const rows = await this.db.query("SELECT key FROM hidden_tips");
    return rows.map((r) => String(r.key));
  }

  async addHiddenTipKey(key: string): Promise<void> {
    await this.ensureMigrated();
    // 既存でも冪等（同一主キーは無視）。
    await this.db.exec("INSERT OR IGNORE INTO hidden_tips (key) VALUES (?)", [
      key,
    ]);
  }

  async clearHiddenTipKeys(): Promise<void> {
    await this.ensureMigrated();
    await this.db.exec("DELETE FROM hidden_tips");
  }

  // ── アプリ設定 ───────────────────────────────────────────
  async getLocale(): Promise<string> {
    return this.getStr(K_LOCALE);
  }
  async setLocale(locale: string): Promise<void> {
    await this.setStr(K_LOCALE, locale);
  }

  async getAreaDetailRadiusKm(): Promise<number> {
    const s = await this.getStr(K_AREA_RADIUS);
    const n = Number(s);
    return s !== "" && Number.isFinite(n) ? n : 0;
  }
  async setAreaDetailRadiusKm(km: number): Promise<void> {
    await this.setStr(K_AREA_RADIUS, String(km));
  }

  async getAiProvider(): Promise<string> {
    return this.getStr(K_AI_PROVIDER);
  }
  async setAiProvider(provider: string): Promise<void> {
    await this.setStr(K_AI_PROVIDER, provider);
  }

  async getAiApiKey(provider: string): Promise<string> {
    return this.getStr(K_AI_APIKEY_PREFIX + provider);
  }
  async setAiApiKey(provider: string, key: string): Promise<void> {
    await this.setStr(K_AI_APIKEY_PREFIX + provider, key);
  }

  async getAiModel(): Promise<string> {
    return this.getStr(K_AI_MODEL);
  }
  async setAiModel(model: string): Promise<void> {
    await this.setStr(K_AI_MODEL, model);
  }

  async getAiMapImportConsent(): Promise<boolean> {
    return (await this.getStr(K_AI_CONSENT)) === "true";
  }
  async setAiMapImportConsent(consented: boolean): Promise<void> {
    await this.setStr(K_AI_CONSENT, consented ? "true" : "false");
  }
}
