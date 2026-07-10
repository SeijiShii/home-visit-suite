// desktop/frontend/src/pages/SettingsPage.tsx からの移植。
// ヘルプ表示リセット（TipsContext）と開発用データ削除（RegionBinding /
// AvailablePeriodBinding）のセクションは、対応するサービス層の移植時に追加する。

import { useEffect, useState } from "react";
import { useI18n } from "../contexts/I18nContext";
import { useIdentity } from "../contexts/IdentityContext";
import { useServices } from "../contexts/ServicesContext";
import {
  AI_MODEL_OPTIONS,
  AI_PROVIDERS,
  DEFAULT_AI_MODEL,
  DEFAULT_AI_PROVIDER,
  defaultModelForProvider,
  maskApiKey,
  resolveModel,
} from "../services/settings-service";
import { removeOrphanVertices } from "../lib/map-maintenance";
import type { Locales } from "../i18n/i18n-types";

export function SettingsPage() {
  const { t, locale, setLocale } = useI18n();
  const {
    currentActorID,
    realDID,
    isDevMode,
    availableIdentities,
    switchIdentity,
  } = useIdentity();
  const { settingsService, mapBinding } = useServices();
  const [identityMsg, setIdentityMsg] = useState<string>("");
  const [orphanMsg, setOrphanMsg] = useState<string>("");

  const [aiProvider, setAiProvider] = useState<string>(DEFAULT_AI_PROVIDER);
  const [aiModel, setAiModel] = useState<string>(DEFAULT_AI_MODEL);
  const [aiKeyInput, setAiKeyInput] = useState<string>("");
  const [aiSavedKey, setAiSavedKey] = useState<string>("");
  const [aiMsg, setAiMsg] = useState<string>("");

  // モデル ID → 表示ラベル（i18n）。一覧に無い ID は ID をそのまま表示する。
  const modelLabels: Record<string, string> = {
    "claude-haiku-4-5-20251001": t.settings.aiModelHaiku,
    "claude-sonnet-5": t.settings.aiModelSonnet,
    "claude-opus-4-8": t.settings.aiModelOpus,
    "gemini-3.1-flash-lite": t.settings.aiModelGeminiFlashLite,
    "gemini-3.5-flash": t.settings.aiModelGeminiFlash,
  };
  const providerLabels: Record<string, string> = {
    anthropic: t.settings.aiProviderAnthropic,
    gemini: t.settings.aiProviderGemini,
  };
  // プロバイダ別の API キー発行ページ（利用者が設定画面から直接飛べるように）。
  const apiKeyGuideUrls: Record<string, string> = {
    anthropic: "https://console.anthropic.com/settings/keys",
    gemini: "https://aistudio.google.com/app/apikey",
  };

  useEffect(() => {
    let active = true;
    void (async () => {
      const [provider, model] = await Promise.all([
        settingsService.getAiProvider(),
        settingsService.getAiModel(),
      ]);
      const key = await settingsService.getAiApiKey(provider);
      if (!active) return;
      setAiProvider(provider);
      setAiModel(resolveModel(provider, model));
      setAiSavedKey(key);
    })();
    return () => {
      active = false;
    };
  }, [settingsService]);

  // プロバイダ切替時: モデルをそのプロバイダの既定へ、登録キー表示をそのプロバイダの保存値へ更新。
  const handleProviderChange = async (provider: string) => {
    setAiProvider(provider);
    setAiModel(defaultModelForProvider(provider));
    setAiKeyInput("");
    const key = await settingsService.getAiApiKey(provider);
    setAiSavedKey(key);
  };

  const handleAiSave = async () => {
    await settingsService.setAiProvider(aiProvider);
    await settingsService.setAiModel(aiModel);
    if (aiKeyInput !== "") {
      await settingsService.setAiApiKey(aiProvider, aiKeyInput);
      setAiSavedKey(aiKeyInput);
      setAiKeyInput("");
    }
    setAiMsg(t.settings.aiSaved);
    setTimeout(() => setAiMsg(""), 3000);
  };

  const handleAiClear = async () => {
    await settingsService.setAiApiKey(aiProvider, "");
    setAiSavedKey("");
    setAiKeyInput("");
  };

  const handleIdentitySwitch = async (did: string) => {
    if (did === currentActorID) return;
    try {
      await switchIdentity(did);
      const u = availableIdentities.find((u) => u.id === did);
      setIdentityMsg(t.settingsDev.identitySwitched(u?.name ?? did));
      setTimeout(() => setIdentityMsg(""), 3000);
    } catch (e) {
      setIdentityMsg(`switch failed: ${String(e)}`);
    }
  };

  const handleLocaleChange = async (newLocale: Locales) => {
    await setLocale(newLocale);
  };

  const handleRemoveOrphans = async () => {
    const n = await removeOrphanVertices(mapBinding);
    setOrphanMsg(t.settingsDev.orphanDone(n));
    setTimeout(() => setOrphanMsg(""), 3000);
  };

  return (
    <div className="settings-page">
      <h1>{t.settings.title}</h1>

      <section className="settings-section">
        <h2>{t.settings.language}</h2>
        <div className="settings-locale-options">
          <label>
            <input
              type="radio"
              name="locale"
              value="ja"
              checked={locale === "ja"}
              onChange={() => void handleLocaleChange("ja")}
            />
            {t.settings.languageJa}
          </label>
          <label>
            <input
              type="radio"
              name="locale"
              value="en"
              checked={locale === "en"}
              onChange={() => void handleLocaleChange("en")}
            />
            {t.settings.languageEn}
          </label>
        </div>
      </section>

      <section className="settings-section">
        <h2>{t.settings.aiSection}</h2>
        <p className="settings-section-description">
          {t.settings.aiDescription}
        </p>
        <div className="settings-field">
          <label className="settings-field-label" htmlFor="ai-provider">
            {t.settings.aiProvider}
          </label>
          <select
            id="ai-provider"
            className="settings-select"
            value={aiProvider}
            onChange={(e) => void handleProviderChange(e.target.value)}
          >
            {AI_PROVIDERS.map((p) => (
              <option key={p} value={p}>
                {providerLabels[p] ?? p}
              </option>
            ))}
          </select>
        </div>
        <div className="settings-field">
          <label className="settings-field-label" htmlFor="ai-model">
            {t.settings.aiModel}
          </label>
          <select
            id="ai-model"
            className="settings-select"
            value={aiModel}
            onChange={(e) => setAiModel(e.target.value)}
          >
            {(AI_MODEL_OPTIONS[aiProvider] ?? []).map((m) => (
              <option key={m} value={m}>
                {modelLabels[m] ?? m}
              </option>
            ))}
          </select>
        </div>
        <div className="settings-field">
          <label className="settings-field-label" htmlFor="ai-api-key">
            {t.settings.aiApiKey}
          </label>
          <span className="settings-ai-key-status">
            {aiSavedKey
              ? `${t.settings.aiApiKeyRegistered}（${maskApiKey(aiSavedKey)}）`
              : t.settings.aiApiKeyNotSet}
          </span>
          <input
            id="ai-api-key"
            className="settings-input"
            type="password"
            autoComplete="off"
            placeholder={t.settings.aiApiKeyPlaceholder}
            value={aiKeyInput}
            onChange={(e) => setAiKeyInput(e.target.value)}
          />
          {apiKeyGuideUrls[aiProvider] && (
            <a
              className="settings-ai-key-guide"
              href={apiKeyGuideUrls[aiProvider]}
              target="_blank"
              rel="noreferrer"
            >
              {t.settings.aiApiKeyGuide}
            </a>
          )}
        </div>
        <div className="settings-field-actions">
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={() => void handleAiSave()}
          >
            {t.settings.aiSave}
          </button>
          {aiSavedKey && (
            <button
              type="button"
              className="btn btn-sm"
              onClick={() => void handleAiClear()}
            >
              {t.settings.aiClear}
            </button>
          )}
        </div>
        <p className="settings-section-note">{t.settings.aiApiKeyNote}</p>
        {aiMsg && (
          <p className="settings-msg" role="status">
            {aiMsg}
          </p>
        )}
      </section>

      {isDevMode && (
        <section className="settings-section">
          <h2>{t.settingsDev.identityTitle}</h2>
          <p className="settings-section-description">
            {t.settingsDev.identityDescription}
          </p>
          <div className="settings-dev-identity-list">
            {availableIdentities.map((u) => (
              <label key={u.id} className="settings-dev-identity-item">
                <input
                  type="radio"
                  name="identity"
                  value={u.id}
                  checked={currentActorID === u.id}
                  onChange={() => void handleIdentitySwitch(u.id)}
                />
                <span className="settings-dev-identity-name">
                  {u.name}
                  <span className="settings-dev-identity-meta">({u.role})</span>
                  {u.id === realDID && (
                    <span className="settings-dev-identity-self">
                      {t.settingsDev.identitySelf}
                    </span>
                  )}
                </span>
              </label>
            ))}
          </div>
          {identityMsg && (
            <p className="settings-msg" role="status">
              {identityMsg}
            </p>
          )}
        </section>
      )}

      {isDevMode && (
        <section className="settings-section">
          <h2>{t.settingsDev.orphanTitle}</h2>
          <p className="settings-section-description">
            {t.settingsDev.orphanDescription}
          </p>
          <div className="settings-field-actions">
            <button
              type="button"
              className="btn btn-sm"
              onClick={() => void handleRemoveOrphans()}
            >
              {t.settingsDev.orphanButton}
            </button>
          </div>
          {orphanMsg && (
            <p className="settings-msg" role="status">
              {orphanMsg}
            </p>
          )}
        </section>
      )}
    </div>
  );
}
