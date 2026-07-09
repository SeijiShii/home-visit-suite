// SettingsBinding API（Wails自動生成の関数群に対応）
export interface SettingsBindingAPI {
  GetHiddenTipKeys(): Promise<string[] | null>;
  SetTipHidden(key: string, hidden: boolean): Promise<void>;
  ResetHiddenTips(): Promise<void>;
  GetLocale(): Promise<string>;
  SetLocale(locale: string): Promise<void>;
  GetAreaDetailRadiusKm(): Promise<number>;
  SetAreaDetailRadiusKm(km: number): Promise<void>;
  GetAiProvider(): Promise<string>;
  SetAiProvider(provider: string): Promise<void>;
  GetAiApiKey(): Promise<string>;
  SetAiApiKey(key: string): Promise<void>;
  GetAiModel(): Promise<string>;
  SetAiModel(model: string): Promise<void>;
  GetAiMapImportConsent(): Promise<boolean>;
  SetAiMapImportConsent(consented: boolean): Promise<void>;
}

/** AI 地図取込用 API キーの既定プロバイダ識別子。 */
export const DEFAULT_AI_PROVIDER = "anthropic";

/** AI 地図取込の既定モデル ID（vision 対応の最上位モデル）。 */
export const DEFAULT_AI_MODEL = "claude-opus-4-8";

/** 設定画面で選べる vision 対応モデル（品質/コストの異なる 3 段）。 */
export const AI_MODEL_OPTIONS = [
  "claude-opus-4-8",
  "claude-sonnet-5",
  "claude-haiku-4-5-20251001",
] as const;

/**
 * API キーを表示用にマスクする。末尾 4 文字のみ残し、それ以外を `•` に置換する。
 * ただし 4 文字以下のキーは末尾も露出させず全マスクする（短いキーの推測防止）。
 */
export function maskApiKey(key: string): string {
  if (key.length === 0) return "";
  if (key.length <= 4) return "•".repeat(key.length);
  return "•".repeat(key.length - 4) + key.slice(-4);
}

// フロントエンド向けサービス（Wails バインディングの薄いラッパ）
export class SettingsService {
  constructor(private readonly api: SettingsBindingAPI) {}

  async getHiddenTipKeys(): Promise<string[]> {
    const keys = await this.api.GetHiddenTipKeys();
    return keys ?? [];
  }

  async setTipHidden(key: string, hidden: boolean): Promise<void> {
    await this.api.SetTipHidden(key, hidden);
  }

  async resetHiddenTips(): Promise<void> {
    await this.api.ResetHiddenTips();
  }

  async getLocale(): Promise<string> {
    return await this.api.GetLocale();
  }

  async setLocale(locale: string): Promise<void> {
    await this.api.SetLocale(locale);
  }

  async getAreaDetailRadiusKm(): Promise<number> {
    return await this.api.GetAreaDetailRadiusKm();
  }

  async setAreaDetailRadiusKm(km: number): Promise<void> {
    await this.api.SetAreaDetailRadiusKm(km);
  }

  /** AI プロバイダ識別子を返す。未設定時は既定 (`anthropic`) を返す。 */
  async getAiProvider(): Promise<string> {
    const p = await this.api.GetAiProvider();
    return p || DEFAULT_AI_PROVIDER;
  }

  async setAiProvider(provider: string): Promise<void> {
    await this.api.SetAiProvider(provider);
  }

  /** AI API キーを返す。未設定時は空文字を返す。 */
  async getAiApiKey(): Promise<string> {
    return await this.api.GetAiApiKey();
  }

  async setAiApiKey(key: string): Promise<void> {
    await this.api.SetAiApiKey(key);
  }

  /** AI モデル ID を返す。未設定時は既定モデルを返す。 */
  async getAiModel(): Promise<string> {
    const m = await this.api.GetAiModel();
    return m || DEFAULT_AI_MODEL;
  }

  async setAiModel(model: string): Promise<void> {
    await this.api.SetAiModel(model);
  }

  /** AI 地図取込の画像外部送信への同意有無を返す。 */
  async getAiMapImportConsent(): Promise<boolean> {
    return await this.api.GetAiMapImportConsent();
  }

  async setAiMapImportConsent(consented: boolean): Promise<void> {
    await this.api.SetAiMapImportConsent(consented);
  }
}
