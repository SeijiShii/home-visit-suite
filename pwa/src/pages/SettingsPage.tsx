// desktop/frontend/src/pages/SettingsPage.tsx からの移植。
// ヘルプ表示リセット（TipsContext）と開発用データ削除（RegionBinding /
// AvailablePeriodBinding）のセクションは、対応するサービス層の移植時に追加する。

import { useCallback, useEffect, useRef, useState } from "react";
import { QrCode } from "../components/QrCode";
import { useI18n } from "../contexts/I18nContext";
import { useIdentity } from "../contexts/IdentityContext";
import { useServices } from "../contexts/ServicesContext";
import type { Device } from "../domain/models/device";
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
    hasIdentity,
    createPairingToken,
    listDevices,
    getCurrentDeviceId,
    renameDevice,
    removeDevice,
  } = useIdentity();
  const { settingsService, mapBinding } = useServices();
  const [identityMsg, setIdentityMsg] = useState<string>("");
  const [orphanMsg, setOrphanMsg] = useState<string>("");
  const [pairingUrl, setPairingUrl] = useState<string | null>(null);
  const [pairingErr, setPairingErr] = useState<string>("");
  const [urlCopied, setUrlCopied] = useState(false);
  const pairingUrlRef = useRef<HTMLInputElement>(null);
  const [devices, setDevices] = useState<Device[]>([]);
  const [currentDeviceId, setCurrentDeviceId] = useState<string>("");
  const [renameTarget, setRenameTarget] = useState<{
    id: string;
    label: string;
  } | null>(null);
  const [deviceConfirm, setDeviceConfirm] = useState<{ id: string } | null>(
    null,
  );

  const reloadDevices = useCallback(async () => {
    if (!hasIdentity) return;
    try {
      const [list, cur] = await Promise.all([
        listDevices(),
        getCurrentDeviceId(),
      ]);
      setDevices(list);
      setCurrentDeviceId(cur);
    } catch (e) {
      console.error("listDevices failed", e);
    }
  }, [hasIdentity, listDevices, getCurrentDeviceId]);

  useEffect(() => {
    void reloadDevices();
  }, [reloadDevices]);

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

  const handleAddDevice = async () => {
    setPairingErr("");
    setUrlCopied(false);
    try {
      const { url } = await createPairingToken();
      setPairingUrl(url);
    } catch (e) {
      console.error("createPairingToken failed", e);
      setPairingErr(String(e));
    }
  };

  const handleCopyPairingUrl = async () => {
    if (!pairingUrl) return;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(pairingUrl);
      } else {
        // 非セキュアコンテキスト(http LAN 等)で clipboard API が使えない場合のフォールバック
        const el = pairingUrlRef.current;
        if (el) {
          el.select();
          document.execCommand("copy");
        }
      }
      setUrlCopied(true);
      setTimeout(() => setUrlCopied(false), 2000);
    } catch (e) {
      console.error("copy failed", e);
    }
  };

  const handleRenameDevice = async () => {
    if (!renameTarget) return;
    await renameDevice(renameTarget.id, renameTarget.label);
    setRenameTarget(null);
    await reloadDevices();
  };

  const handleDeviceConfirm = async () => {
    if (!deviceConfirm) return;
    try {
      await removeDevice(deviceConfirm.id);
      setDeviceConfirm(null);
      await reloadDevices();
    } catch (e) {
      console.error("device action failed", e);
      setDeviceConfirm(null);
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

      {hasIdentity && (
        <section className="settings-section">
          <h2>{t.devicePairing.section}</h2>
          <p className="settings-section-description">
            {t.devicePairing.description}
          </p>
          <div className="settings-field-actions">
            <button
              type="button"
              className="btn btn-sm"
              onClick={() => void handleAddDevice()}
            >
              {t.devicePairing.addDevice}
            </button>
          </div>
          {pairingErr && (
            <p className="settings-msg" role="status">
              {pairingErr}
            </p>
          )}

          <h3 className="device-list-title">{t.devicePairing.listTitle}</h3>
          <ul className="device-list">
            {devices.map((d) => (
              <li key={d.id} className="device-list-item">
                <span className="device-list-label">
                  {d.label || t.devicePairing.unnamedDevice}
                  {d.id === currentDeviceId && (
                    <span className="device-list-current">
                      {t.devicePairing.thisDevice}
                    </span>
                  )}
                </span>
                <span className="device-list-actions">
                  <button
                    type="button"
                    className="btn btn-sm"
                    onClick={() =>
                      setRenameTarget({ id: d.id, label: d.label })
                    }
                  >
                    {t.devicePairing.rename}
                  </button>
                  {d.id !== currentDeviceId && (
                    <button
                      type="button"
                      className="btn btn-sm btn-danger"
                      onClick={() => setDeviceConfirm({ id: d.id })}
                    >
                      {t.devicePairing.remove}
                    </button>
                  )}
                </span>
              </li>
            ))}
          </ul>
          <p className="device-pairing-note">
            {t.devicePairing.listPendingNote}
          </p>
          <p className="device-pairing-note">{t.devicePairing.removeNote}</p>
        </section>
      )}

      {pairingUrl && (
        <div className="modal-overlay" onClick={() => setPairingUrl(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3 className="modal-title">{t.devicePairing.dialogTitle}</h3>
            <p className="settings-section-description">
              {t.devicePairing.dialogHint}
            </p>
            <div className="device-pairing-qr">
              <QrCode text={pairingUrl} />
            </div>
            <div className="device-pairing-url-row">
              <input
                ref={pairingUrlRef}
                className="device-pairing-url"
                value={pairingUrl}
                readOnly
                onFocus={(e) => e.currentTarget.select()}
              />
              <button
                type="button"
                className="btn btn-sm"
                onClick={() => void handleCopyPairingUrl()}
              >
                {urlCopied ? t.devicePairing.copied : t.devicePairing.copyUrl}
              </button>
            </div>
            <p className="device-pairing-note">{t.devicePairing.expiresNote}</p>
            <p className="device-pairing-note">
              {t.devicePairing.syncPendingNote}
            </p>
            <div className="modal-actions">
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => setPairingUrl(null)}
              >
                {t.devicePairing.close}
              </button>
            </div>
          </div>
        </div>
      )}

      {renameTarget && (
        <div className="modal-overlay" onClick={() => setRenameTarget(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3 className="modal-title">{t.devicePairing.renameTitle}</h3>
            <div className="modal-field">
              <label className="modal-label">
                {t.devicePairing.labelLabel}
              </label>
              <input
                className="modal-input"
                value={renameTarget.label}
                autoFocus
                onChange={(e) =>
                  setRenameTarget({ ...renameTarget, label: e.target.value })
                }
                onKeyDown={(e) => {
                  if (e.key === "Enter") void handleRenameDevice();
                  if (e.key === "Escape") setRenameTarget(null);
                }}
              />
            </div>
            <div className="modal-actions">
              <button
                type="button"
                className="btn"
                onClick={() => setRenameTarget(null)}
              >
                {t.devicePairing.cancel}
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => void handleRenameDevice()}
              >
                {t.devicePairing.save}
              </button>
            </div>
          </div>
        </div>
      )}

      {deviceConfirm && (
        <div className="modal-overlay" onClick={() => setDeviceConfirm(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <p className="polygon-delete-dialog-message">
              {t.devicePairing.confirmRemove}
            </p>
            <div className="modal-actions">
              <button
                type="button"
                className="btn"
                onClick={() => setDeviceConfirm(null)}
              >
                {t.devicePairing.cancel}
              </button>
              <button
                type="button"
                className="btn btn-danger"
                onClick={() => void handleDeviceConfirm()}
              >
                {t.devicePairing.remove}
              </button>
            </div>
          </div>
        </div>
      )}

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
