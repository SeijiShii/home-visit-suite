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
}

/** AI 地図取込用 API キーの既定プロバイダ識別子。 */
export const DEFAULT_AI_PROVIDER = "anthropic";

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
}
