// SettingsBindingAPI（settings-service が要求する抽象、旧 Wails SettingsBinding 相当）を
// PersonalRepository 上に実装する。SettingsService / TipsContext / I18nContext が利用する。

import type { PersonalRepository } from "../domain/repositories/personal-repository";
import type { SettingsBindingAPI } from "./settings-service";

export class PersonalRepositorySettingsAdapter implements SettingsBindingAPI {
  constructor(private repo: PersonalRepository) {}

  async GetHiddenTipKeys(): Promise<string[] | null> {
    return this.repo.getHiddenTipKeys();
  }

  async SetTipHidden(key: string, hidden: boolean): Promise<void> {
    // PersonalRepository は個別キーの非表示追加のみ提供する（解除は resetHiddenTips 経由）。
    // 現行の Tips UI は hidden=true でのみ呼ぶため、false は no-op とする。
    if (hidden) {
      await this.repo.addHiddenTipKey(key);
    }
  }

  async ResetHiddenTips(): Promise<void> {
    await this.repo.clearHiddenTipKeys();
  }

  async GetLocale(): Promise<string> {
    return this.repo.getLocale();
  }

  async SetLocale(locale: string): Promise<void> {
    await this.repo.setLocale(locale);
  }

  async GetAreaDetailRadiusKm(): Promise<number> {
    return this.repo.getAreaDetailRadiusKm();
  }

  async SetAreaDetailRadiusKm(km: number): Promise<void> {
    await this.repo.setAreaDetailRadiusKm(km);
  }
}
