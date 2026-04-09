// SettingsBinding API（Wails自動生成の関数群に対応）
export interface SettingsBindingAPI {
  GetHiddenTipKeys(): Promise<string[] | null>;
  SetTipHidden(key: string, hidden: boolean): Promise<void>;
  ResetHiddenTips(): Promise<void>;
  GetLocale(): Promise<string>;
  SetLocale(locale: string): Promise<void>;
  GetAreaDetailRadiusKm(): Promise<number>;
  SetAreaDetailRadiusKm(km: number): Promise<void>;
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
}
