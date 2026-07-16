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

/** 区域詳細編集の隣接半径の既定値 (km)。docs/wants/01_共通基盤.md「アプリ設定画面」参照。 */
export const DEFAULT_AREA_DETAIL_RADIUS_KM = 2.5;

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

  /** 隣接半径 (km) を返す。未設定・不正値 (0 以下/非有限) は既定 2.5 へフォールバックする。 */
  async getAreaDetailRadiusKm(): Promise<number> {
    const km = await this.api.GetAreaDetailRadiusKm();
    return Number.isFinite(km) && km > 0 ? km : DEFAULT_AREA_DETAIL_RADIUS_KM;
  }

  async setAreaDetailRadiusKm(km: number): Promise<void> {
    await this.api.SetAreaDetailRadiusKm(km);
  }
}
