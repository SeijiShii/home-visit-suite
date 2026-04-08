import { useState } from "react";
import { useI18n } from "../contexts/I18nContext";
import { useTips } from "../contexts/TipsContext";
import type { Locales } from "../i18n/i18n-types";

export function SettingsPage() {
  const { t, locale, setLocale } = useI18n();
  const { resetHiddenTips } = useTips();
  const [resetDone, setResetDone] = useState(false);

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
    </div>
  );
}
