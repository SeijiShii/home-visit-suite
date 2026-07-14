// アプリのロゴ + アプリ名の共通ブランド表示。
// 初回系画面（オンボーディング / グループ参加 / 端末引き継ぎ）はアプリ本体の
// ナビゲーションが無く「何のアプリか」が伝わらないため、カード先頭に掲げる。
// アプリ名は固有名詞のため i18n 対象外（翻訳しない）。
// 仕様: docs/wants/04_メンバー管理と権限.md「初回オンボーディングと創設メンバー」

/** ロゴは public/icon.svg（PWA アイコン）と同一図案のインライン SVG。 */
export function AppBrand() {
  return (
    <div className="app-brand">
      <svg
        className="app-brand-logo"
        viewBox="0 0 64 64"
        role="img"
        aria-label="Home Visit Suite"
      >
        <rect width="64" height="64" rx="12" fill="#1e293b" />
        <path
          d="M32 14 L52 32 H46 V50 H36 V38 H28 V50 H18 V32 H12 Z"
          fill="#e2e8f0"
        />
      </svg>
      <span className="app-brand-name">Home Visit Suite</span>
    </div>
  );
}
