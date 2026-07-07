// PWA アプリシェル（スキャフォールド段階の最小構成）。
// 画面群は desktop/frontend/src/pages から順次移植する。

import { useI18n } from "./contexts/I18nContext";

export default function App() {
  const { t, locale, setLocale } = useI18n();

  return (
    <div className="layout">
      <aside className="sidebar">
        <div className="sidebar-header">
          <h3 className="app-title">Home Visit</h3>
        </div>
        <nav className="nav-links" />
        <div className="sidebar-footer">
          <button
            type="button"
            className="locale-btn"
            onClick={() => void setLocale(locale === "ja" ? "en" : "ja")}
          >
            {locale === "ja" ? t.settings.languageEn : t.settings.languageJa}
          </button>
        </div>
      </aside>
      <main className="content">
        <h1>{t.nav.dashboard}</h1>
      </main>
    </div>
  );
}
