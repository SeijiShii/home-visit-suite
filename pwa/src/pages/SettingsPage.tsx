// desktop/frontend/src/pages/SettingsPage.tsx からの移植。
// ヘルプ表示リセット（TipsContext）と開発用データ削除（RegionBinding /
// AvailablePeriodBinding）のセクションは、対応するサービス層の移植時に追加する。

import { useEffect, useState } from "react";
import { useI18n } from "../contexts/I18nContext";
import { useIdentity } from "../contexts/IdentityContext";
import { useServices } from "../contexts/ServicesContext";
import { maskApiKey } from "../services/settings-service";
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
  const { settingsService } = useServices();
  const [identityMsg, setIdentityMsg] = useState<string>("");

  const [aiProvider, setAiProvider] = useState<string>("anthropic");
  const [aiModel, setAiModel] = useState<string>("claude-opus-4-8");
  const [aiKeyInput, setAiKeyInput] = useState<string>("");
  const [aiSavedKey, setAiSavedKey] = useState<string>("");
  const [aiMsg, setAiMsg] = useState<string>("");

  useEffect(() => {
    let active = true;
    void (async () => {
      const [provider, model, key] = await Promise.all([
        settingsService.getAiProvider(),
        settingsService.getAiModel(),
        settingsService.getAiApiKey(),
      ]);
      if (!active) return;
      setAiProvider(provider);
      setAiModel(model);
      setAiSavedKey(key);
    })();
    return () => {
      active = false;
    };
  }, [settingsService]);

  const handleAiSave = async () => {
    await settingsService.setAiProvider(aiProvider);
    await settingsService.setAiModel(aiModel);
    if (aiKeyInput !== "") {
      await settingsService.setAiApiKey(aiKeyInput);
      setAiSavedKey(aiKeyInput);
      setAiKeyInput("");
    }
    setAiMsg(t.settings.aiSaved);
    setTimeout(() => setAiMsg(""), 3000);
  };

  const handleAiClear = async () => {
    await settingsService.setAiApiKey("");
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
            onChange={(e) => setAiProvider(e.target.value)}
          >
            <option value="anthropic">{t.settings.aiProviderAnthropic}</option>
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
            <option value="claude-opus-4-8">{t.settings.aiModelOpus}</option>
            <option value="claude-sonnet-5">{t.settings.aiModelSonnet}</option>
            <option value="claude-haiku-4-5-20251001">
              {t.settings.aiModelHaiku}
            </option>
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
    </div>
  );
}
