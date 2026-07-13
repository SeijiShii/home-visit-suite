// PersonalRepository の LinkSelf(MyDB) 実装。
// アプリ設定（my_settings）と非表示 tip（hidden_tips）を MyDB の KV に保存する。
// KV は devicesync 経由で同一ユーザーの端末間に複製される（ScopeDevice。
// docs/wants/01_共通基盤.md「同期スコープ」）。localStorage 実装の置き換え。
//
// ノート/タグ/割り当てのドメインデータは当面 InMemory へ委譲する
// （localStorage 実装と同構造。MyDB SQL 化は後続ステップ）。
//
// 注意: API キーは MyDB に平文で入る（利用者自身のキー・端末間共有は本人の端末のみ）。
// 秘匿情報の暗号化ストレージ化は後続で対応（docs/wants/01「秘密鍵の保管」と同様）。

import type { MyDB } from "@linkself/core";
import type {
  PersonalNote,
  PersonalTag,
  PersonalTagAssignment,
} from "../../domain/models/personal";
import type { PersonalRepository } from "../../domain/repositories/personal-repository";
import { InMemoryPersonalRepository } from "../inmemory/inmemory-personal-repository";

const SETTINGS_TABLE = "my_settings";
const HIDDEN_TIPS_TABLE = "hidden_tips";

// 設定キー（my_settings テーブル内の recordId）。
const K_LOCALE = "locale";
const K_AREA_RADIUS = "areaDetailRadiusKm";
const K_AI_PROVIDER = "aiProvider";
const K_AI_MODEL = "aiModel";
const K_AI_CONSENT = "aiMapImportConsent";
const K_AI_APIKEY_PREFIX = "aiApiKey/"; // aiApiKey/<provider>

const enc = new TextEncoder();
const dec = new TextDecoder();

export class LinkSelfPersonalRepository implements PersonalRepository {
  // ノート/タグ/割り当ては当面インメモリに委譲（MyDB SQL 化は後続ステップ）。
  private readonly inner = new InMemoryPersonalRepository();

  constructor(private readonly db: MyDB) {}

  // ── 設定 KV ヘルパ ───────────────────────────────────────
  private async getStr(key: string): Promise<string> {
    const rec = await this.db.get(SETTINGS_TABLE, key);
    return rec?.body ? dec.decode(rec.body) : "";
  }
  private async setStr(key: string, value: string): Promise<void> {
    await this.db.put(SETTINGS_TABLE, key, enc.encode(value));
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

  // ── 非表示 tip（hidden_tips テーブル: キー1つ=1レコード） ──
  async getHiddenTipKeys(): Promise<string[]> {
    const recs = await this.db.list(HIDDEN_TIPS_TABLE);
    return recs.map((r) => r.id);
  }

  async addHiddenTipKey(key: string): Promise<void> {
    // 既存でも put は冪等（同一 recordId 上書き）。マーカーとして空バイト列を置く。
    await this.db.put(HIDDEN_TIPS_TABLE, key, new Uint8Array(0));
  }

  async clearHiddenTipKeys(): Promise<void> {
    const recs = await this.db.list(HIDDEN_TIPS_TABLE);
    for (const r of recs) {
      await this.db.delete(HIDDEN_TIPS_TABLE, r.id);
    }
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
