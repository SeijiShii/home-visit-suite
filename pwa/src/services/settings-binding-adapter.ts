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

  async GetAiProvider(): Promise<string> {
    return this.repo.getAiProvider();
  }

  async SetAiProvider(provider: string): Promise<void> {
    await this.repo.setAiProvider(provider);
  }

  async GetAiApiKey(provider: string): Promise<string> {
    return this.repo.getAiApiKey(provider);
  }

  async SetAiApiKey(provider: string, key: string): Promise<void> {
    await this.repo.setAiApiKey(provider, key);
  }

  async GetAiModel(): Promise<string> {
    return this.repo.getAiModel();
  }

  async SetAiModel(model: string): Promise<void> {
    await this.repo.setAiModel(model);
  }

  async GetAiMapImportConsent(): Promise<boolean> {
    return this.repo.getAiMapImportConsent();
  }

  async SetAiMapImportConsent(consented: boolean): Promise<void> {
    await this.repo.setAiMapImportConsent(consented);
  }
}
