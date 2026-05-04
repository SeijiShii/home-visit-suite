import { useState } from "react";
import { useI18n } from "../contexts/I18nContext";
import { useIdentity } from "../contexts/IdentityContext";
import { useTips } from "../contexts/TipsContext";
import type { Locales } from "../i18n/i18n-types";
import * as RegionBinding from "../../wailsjs/go/binding/RegionBinding";
import * as ScheduleBinding from "../../wailsjs/go/binding/ScheduleBinding";

export function SettingsPage() {
  const { t, locale, setLocale } = useI18n();
  const { resetHiddenTips } = useTips();
  const {
    currentActorID,
    realDID,
    isDevMode,
    availableIdentities,
    switchIdentity,
  } = useIdentity();
  const [resetDone, setResetDone] = useState(false);
  const [devMsg, setDevMsg] = useState<string>("");
  const [identityMsg, setIdentityMsg] = useState<string>("");

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

  const flashDevMsg = (msg: string) => {
    setDevMsg(msg);
    setTimeout(() => setDevMsg(""), 3000);
  };

  const handleDeleteAllRegions = async () => {
    if (!window.confirm(t.settingsDev.confirmRegions)) return;
    const regions = (await RegionBinding.ListRegions()) ?? [];
    for (const r of regions) {
      const pas = (await RegionBinding.ListParentAreas(r.id)) ?? [];
      for (const pa of pas) {
        const areas = (await RegionBinding.ListAreas(pa.id)) ?? [];
        for (const a of areas) {
          await RegionBinding.DeleteArea(a.id);
        }
        await RegionBinding.DeleteParentArea(pa.id);
      }
      await RegionBinding.DeleteRegion(r.id);
    }
    flashDevMsg(t.settingsDev.done);
  };

  const handleDeleteAllSchedules = async () => {
    if (!window.confirm(t.settingsDev.confirmSchedules)) return;
    const periods = (await ScheduleBinding.ListSchedulePeriods()) ?? [];
    for (const p of periods) {
      const scopes = (await ScheduleBinding.ListScopes(p.id)) ?? [];
      for (const sc of scopes) {
        const aas = (await ScheduleBinding.ListAreaAvailabilities(sc.id)) ?? [];
        for (const aa of aas) {
          await ScheduleBinding.DeleteAreaAvailability(aa.id);
        }
        await ScheduleBinding.DeleteScope(sc.id);
      }
      await ScheduleBinding.DeleteSchedulePeriod(p.id);
    }
    flashDevMsg(t.settingsDev.done);
  };

  const handleReset = async () => {
    await resetHiddenTips();
    setResetDone(true);
    setTimeout(() => setResetDone(false), 3000);
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
        <h2>{t.settings.helpSection}</h2>
        <button
          type="button"
          className="settings-btn"
          onClick={() => void handleReset()}
        >
          {t.settings.resetHelp}
        </button>
        {resetDone && (
          <p className="settings-msg" role="status">
            {t.settings.resetHelpDone}
          </p>
        )}
      </section>

      <section className="settings-section">
        <h2>{t.settingsDev.title}</h2>
        <p style={{ fontSize: 13, color: "#64748b", marginBottom: 8 }}>
          {t.settingsDev.description}
        </p>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button
            type="button"
            className="settings-btn"
            onClick={() => void handleDeleteAllRegions()}
          >
            {t.settingsDev.deleteAllRegions}
          </button>
          <button
            type="button"
            className="settings-btn"
            onClick={() => void handleDeleteAllSchedules()}
          >
            {t.settingsDev.deleteAllSchedules}
          </button>
        </div>
        {devMsg && (
          <p className="settings-msg" role="status">
            {devMsg}
          </p>
        )}
      </section>

      {isDevMode && (
        <section className="settings-section">
          <h2>{t.settingsDev.identityTitle}</h2>
          <p style={{ fontSize: 13, color: "#64748b", marginBottom: 8 }}>
            {t.settingsDev.identityDescription}
          </p>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 6,
              maxHeight: 320,
              overflowY: "auto",
              border: "1px solid #e2e8f0",
              padding: 8,
              borderRadius: 4,
            }}
          >
            {availableIdentities.map((u) => (
              <label
                key={u.id}
                style={{ display: "flex", gap: 8, alignItems: "center" }}
              >
                <input
                  type="radio"
                  name="identity"
                  value={u.id}
                  checked={currentActorID === u.id}
                  onChange={() => void handleIdentitySwitch(u.id)}
                />
                <span style={{ flex: 1 }}>
                  {u.name}{" "}
                  <span style={{ color: "#64748b", fontSize: 12 }}>
                    ({u.role})
                  </span>
                  {u.id === realDID && (
                    <span
                      style={{
                        marginLeft: 6,
                        color: "#0284c7",
                        fontSize: 12,
                      }}
                    >
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
