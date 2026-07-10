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
  /** プロバイダ別に API キーを取得する（プロバイダごとにキー体系が異なるため）。 */
  GetAiApiKey(provider: string): Promise<string>;
  SetAiApiKey(provider: string, key: string): Promise<void>;
  GetAiModel(): Promise<string>;
  SetAiModel(model: string): Promise<void>;
  GetAiMapImportConsent(): Promise<boolean>;
  SetAiMapImportConsent(consented: boolean): Promise<void>;
}

/** 選択可能な AI プロバイダ識別子。 */
export const AI_PROVIDERS = ["anthropic", "gemini"] as const;
export type AiProvider = (typeof AI_PROVIDERS)[number];

/** AI 地図取込の既定プロバイダ識別子。 */
export const DEFAULT_AI_PROVIDER: AiProvider = "anthropic";

/**
 * プロバイダ別の vision 対応モデル一覧（各先頭が既定＝低コスト側）。
 * Anthropic の既定は Haiku、Gemini の既定は無料枠のある Flash。
 */
export const AI_MODEL_OPTIONS: Record<string, readonly string[]> = {
  anthropic: [
    "claude-haiku-4-5-20251001",
    "claude-sonnet-5",
    "claude-opus-4-8",
  ],
  gemini: ["gemini-3.1-flash-lite", "gemini-3.5-flash"],
};

/** プロバイダの既定モデル ID を返す（一覧の先頭）。未知プロバイダは既定プロバイダの先頭。 */
export function defaultModelForProvider(provider: string): string {
  const opts = AI_MODEL_OPTIONS[provider];
  return (opts && opts[0]) ?? AI_MODEL_OPTIONS[DEFAULT_AI_PROVIDER][0];
}

/**
 * 保存済みモデルがプロバイダの一覧に無ければ（プロバイダ切替直後など）
 * そのプロバイダの既定モデルへフォールバックする。
 */
export function resolveModel(provider: string, model: string): string {
  const opts = AI_MODEL_OPTIONS[provider];
  return opts && opts.includes(model)
    ? model
    : defaultModelForProvider(provider);
}

/** AI 地図取込の既定モデル ID（既定プロバイダの既定モデル）。 */
export const DEFAULT_AI_MODEL = defaultModelForProvider(DEFAULT_AI_PROVIDER);

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

  /** 指定プロバイダの AI API キーを返す。未設定時は空文字を返す。 */
  async getAiApiKey(provider: string): Promise<string> {
    return await this.api.GetAiApiKey(provider);
  }

  async setAiApiKey(provider: string, key: string): Promise<void> {
    await this.api.SetAiApiKey(provider, key);
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
