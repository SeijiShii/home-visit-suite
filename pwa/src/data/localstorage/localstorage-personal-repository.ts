// PersonalRepository の localStorage 永続実装（開発 / 単体 PWA 用の暫定バックエンド）。
// LinkSelf TS アダプタ（暗号化された個人 DB）完成までのブリッジとして、
// アプリ設定（言語・区域詳細半径・AI プロバイダ/キー/モデル・同意・非表示 tip）を
// ブラウザの localStorage に永続化し、再読み込みでも失われないようにする。
//
// ノート/タグ/割り当てなどのドメインデータは LinkSelf 側で保持される想定のため、
// 内部の InMemoryPersonalRepository に委譲する（開発中の再読み込みで消えるのは許容）。
//
// 注意: API キーは localStorage に平文で保存される（利用者自身のキー・当該端末内のみ）。
// LinkSelf 導入時に暗号化ストレージへ移行する。

import type {
  PersonalNote,
  PersonalTag,
  PersonalTagAssignment,
} from "../../domain/models/personal";
import type { PersonalRepository } from "../../domain/repositories/personal-repository";
import { InMemoryPersonalRepository } from "../inmemory/inmemory-personal-repository";

const STORAGE_KEY = "hvs.personal-settings.v1";

interface PersistedSettings {
  hiddenTipKeys: string[];
  locale: string;
  areaDetailRadiusKm: number;
  aiProvider: string;
  aiApiKeys: Record<string, string>;
  aiModel: string;
  aiMapImportConsent: boolean;
}

function emptySettings(): PersistedSettings {
  return {
    hiddenTipKeys: [],
    locale: "",
    areaDetailRadiusKm: 0,
    aiProvider: "",
    aiApiKeys: {},
    aiModel: "",
    aiMapImportConsent: false,
  };
}

export class LocalStoragePersonalRepository implements PersonalRepository {
  // ノート/タグ/割り当ては当面インメモリに委譲（LinkSelf 導入時に差し替え）。
  private readonly inner = new InMemoryPersonalRepository();
  private settings: PersistedSettings;

  constructor(private readonly storage: Storage = localStorage) {
    this.settings = this.load();
  }

  private load(): PersistedSettings {
    try {
      const raw = this.storage.getItem(STORAGE_KEY);
      if (!raw) return emptySettings();
      const parsed = JSON.parse(raw) as Partial<PersistedSettings>;
      return { ...emptySettings(), ...parsed };
    } catch {
      return emptySettings();
    }
  }

  private persist(): void {
    try {
      this.storage.setItem(STORAGE_KEY, JSON.stringify(this.settings));
    } catch {
      // 容量超過・プライベートモード等では黙って諦める（機能は継続）。
    }
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

  // ── アプリ設定（localStorage 永続） ──────────────────────
  async getHiddenTipKeys(): Promise<string[]> {
    return [...this.settings.hiddenTipKeys];
  }

  async addHiddenTipKey(key: string): Promise<void> {
    if (!this.settings.hiddenTipKeys.includes(key)) {
      this.settings.hiddenTipKeys.push(key);
      this.persist();
    }
  }

  async clearHiddenTipKeys(): Promise<void> {
    this.settings.hiddenTipKeys = [];
    this.persist();
  }

  async getLocale(): Promise<string> {
    return this.settings.locale;
  }

  async setLocale(locale: string): Promise<void> {
    this.settings.locale = locale;
    this.persist();
  }

  async getAreaDetailRadiusKm(): Promise<number> {
    return this.settings.areaDetailRadiusKm;
  }

  async setAreaDetailRadiusKm(km: number): Promise<void> {
    this.settings.areaDetailRadiusKm = km;
    this.persist();
  }

  async getAiProvider(): Promise<string> {
    return this.settings.aiProvider;
  }

  async setAiProvider(provider: string): Promise<void> {
    this.settings.aiProvider = provider;
    this.persist();
  }

  async getAiApiKey(provider: string): Promise<string> {
    return this.settings.aiApiKeys[provider] ?? "";
  }

  async setAiApiKey(provider: string, key: string): Promise<void> {
    this.settings.aiApiKeys[provider] = key;
    this.persist();
  }

  async getAiModel(): Promise<string> {
    return this.settings.aiModel;
  }

  async setAiModel(model: string): Promise<void> {
    this.settings.aiModel = model;
    this.persist();
  }

  async getAiMapImportConsent(): Promise<boolean> {
    return this.settings.aiMapImportConsent;
  }

  async setAiMapImportConsent(consented: boolean): Promise<void> {
    this.settings.aiMapImportConsent = consented;
    this.persist();
  }
}
