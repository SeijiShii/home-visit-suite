// desktop/frontend/src/pages/SettingsPage.tsx からの移植。
// ヘルプ表示リセット（TipsContext）と開発用データ削除（RegionBinding）の
// セクションは、対応するサービス層の移植時に追加する。

import { useCallback, useEffect, useRef, useState } from "react";
import { QrCode } from "../components/QrCode";
import { useI18n } from "../contexts/I18nContext";
import { useIdentity } from "../contexts/IdentityContext";
import { useServices } from "../contexts/ServicesContext";
import type { Device } from "../domain/models/device";
import { removeOrphanVertices } from "../lib/map-maintenance";
import { getDeviceDirectory } from "../lib/device-directory";
import { ROSTER_UPDATED_EVENT } from "../lib/linkself/shared-events";
import { isCode } from "../services/errors";
import type { Locales } from "../i18n/i18n-types";

/** ミリ秒を M:SS 形式に整形する（負値は 0:00）。 */
function formatMMSS(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function SettingsPage() {
  const { t, locale, setLocale } = useI18n();
  const {
    currentActorID,
    currentName,
    renameSelf,
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
  const { mapBinding } = useServices();
  const [identityMsg, setIdentityMsg] = useState<string>("");
  // プロフィール（表示名変更。docs/wants/01「表示名の変更」）
  const [profileName, setProfileName] = useState<string>(currentName);
  const [profileSaved, setProfileSaved] = useState(false);
  const [profileErr, setProfileErr] = useState<string>("");
  const [orphanMsg, setOrphanMsg] = useState<string>("");
  const [pairingUrl, setPairingUrl] = useState<string | null>(null);
  const [pairingExpiresAt, setPairingExpiresAt] = useState<number>(0);
  const [pairingRemainingMs, setPairingRemainingMs] = useState<number>(0);
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
  // ロスター行（兄弟端末）の改名可否 = ラベルを書けるディレクトリ（ネットワーク
  // 配線）の有無。bootstrap で登録済みのため描画時点で確定している。
  const rosterEditable = getDeviceDirectory() != null;
  const [deviceErr, setDeviceErr] = useState<string>("");

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

  // ロスター更新（ペアリング統合・兄弟端末からのラベル変更 announce）で
  // デバイス一覧を再読み込みなしで追従させる（docs/wants/01「ロスター更新の
  // 即時 UI 反映」）。
  useEffect(() => {
    const onRosterUpdated = () => void reloadDevices();
    window.addEventListener(ROSTER_UPDATED_EVENT, onRosterUpdated);
    return () =>
      window.removeEventListener(ROSTER_UPDATED_EVENT, onRosterUpdated);
  }, [reloadDevices]);

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

  // ペアリング URL を（再）発行する。ダイアログ表示中は期限手前で自動再発行される。
  const refreshPairing = useCallback(async () => {
    try {
      const { url, expiresAt } = await createPairingToken();
      setPairingUrl(url);
      setPairingExpiresAt(expiresAt);
      setPairingRemainingMs(expiresAt - Date.now());
      setUrlCopied(false);
    } catch (e) {
      console.error("createPairingToken failed", e);
      setPairingErr(String(e));
    }
  }, [createPairingToken]);

  const handleAddDevice = () => {
    setPairingErr("");
    void refreshPairing();
  };

  const closePairing = () => {
    setPairingUrl(null);
    setPairingExpiresAt(0);
  };

  // ダイアログ表示中: 1秒ごとに残り時間を更新し、期限の少し前に自動再発行する。
  useEffect(() => {
    if (!pairingUrl) return;
    const REFRESH_MARGIN_MS = 20_000;
    const id = window.setInterval(() => {
      const remain = pairingExpiresAt - Date.now();
      if (remain <= REFRESH_MARGIN_MS) {
        void refreshPairing();
      } else {
        setPairingRemainingMs(remain);
      }
    }, 1000);
    return () => window.clearInterval(id);
  }, [pairingUrl, pairingExpiresAt, refreshPairing]);

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
      setDeviceErr("");
      await removeDevice(deviceConfirm.id);
      setDeviceConfirm(null);
      await reloadDevices();
    } catch (e) {
      // 無言の失敗はユーザーが成功と誤認する（独立レビュー所見）。
      console.error("device action failed", e);
      setDeviceErr(t.devicePairing.removeError);
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

  // 表示名の非同期取得（起動直後・dev アクター切替）に追従する。
  useEffect(() => {
    setProfileName(currentName);
  }, [currentName]);

  const profileDirty = profileName.trim() !== currentName;

  const handleSaveProfile = async () => {
    if (!profileDirty || !profileName.trim()) return;
    setProfileErr("");
    try {
      await renameSelf(profileName);
      setProfileSaved(true);
      setTimeout(() => setProfileSaved(false), 2500);
    } catch (e) {
      console.error("renameSelf failed", e);
      setProfileErr(
        isCode(e, "already_exists")
          ? t.settings.displayNameTaken
          : t.settings.displayNameError,
      );
    }
  };

  return (
    <div className="settings-page">
      <h1>{t.settings.title}</h1>

      <section className="settings-section">
        <h2>{t.settings.profileSection}</h2>
        <p className="settings-section-description">
          {t.settings.profileDescription}
        </p>
        <div className="settings-field">
          <label className="settings-field-label" htmlFor="profile-name">
            {t.settings.displayNameLabel}
          </label>
          <input
            id="profile-name"
            className="settings-input"
            value={profileName}
            onChange={(e) => {
              setProfileName(e.target.value);
              setProfileErr("");
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") void handleSaveProfile();
            }}
          />
        </div>
        <div className="settings-save-row">
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => void handleSaveProfile()}
            disabled={!profileDirty || !profileName.trim()}
          >
            {t.common.save}
          </button>
          {profileSaved ? (
            <span className="settings-status settings-status-saved">
              {t.settings.displayNameSaved}
            </span>
          ) : profileDirty ? (
            <span className="settings-status settings-status-dirty">
              {t.settings.displayNameUnsaved}
            </span>
          ) : null}
        </div>
        {profileErr && <p className="onboarding-error">{profileErr}</p>}
      </section>

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
                  {/* ラベル・削除とも全行操作可（SoT はロスター、削除＝失効＋
                      対象端末の全初期化。docs/wants/01「削除の意味」）。ただし
                      ロスター行はディレクトリ（ネットワーク配線）が無いと書けない
                      ため、スタンドアロン時は無言 no-op を避けてボタンを出さない。 */}
                  {(!d.fromRoster || rosterEditable) && (
                    <button
                      type="button"
                      className="btn btn-sm"
                      onClick={() =>
                        setRenameTarget({ id: d.id, label: d.label })
                      }
                    >
                      {t.devicePairing.rename}
                    </button>
                  )}
                  {(!d.fromRoster || rosterEditable) &&
                    d.id !== currentDeviceId && (
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
          {deviceErr && (
            <p className="settings-msg" role="status">
              {deviceErr}
            </p>
          )}
          <p className="device-pairing-note">
            {t.devicePairing.listPendingNote}
          </p>
          <p className="device-pairing-note">{t.devicePairing.removeNote}</p>
        </section>
      )}

      {pairingUrl && (
        <div className="modal-overlay" onClick={closePairing}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3 className="modal-title">{t.devicePairing.dialogTitle}</h3>
            <p className="settings-section-description">
              {t.devicePairing.dialogHint}
            </p>
            <div className="device-pairing-qr">
              {/* payload v2 で情報量が増えたため大きめに描画する（密度対策）。 */}
              <QrCode text={pairingUrl} size={300} />
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
            <p className="device-pairing-countdown">
              {t.devicePairing.expiresIn(formatMMSS(pairingRemainingMs))}
            </p>
            <p className="device-pairing-note">{t.devicePairing.expiresNote}</p>
            <p className="device-pairing-note">
              {t.devicePairing.syncPendingNote}
            </p>
            <div className="modal-actions">
              <button
                type="button"
                className="btn btn-primary"
                onClick={closePairing}
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
