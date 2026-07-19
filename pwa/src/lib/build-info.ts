// ビルド情報（Vite define で焼き込み。docs/wants/01「アプリ情報」）。
// 設定画面の「アプリ情報」セクションが表示し、最新ビルドが端末に読み込まれて
// いるかの確認（PWA/SW・ブラウザキャッシュの旧ビルド残留の切り分け）に使う。
// vitest 等 define が無い環境では "dev" にフォールバックする。

declare const __BUILD_TIME__: string;
declare const __BUILD_COMMIT__: string;

/** ビルド時刻（ISO 8601）。define 無しの環境では "dev"。 */
export const BUILD_TIME: string =
  typeof __BUILD_TIME__ !== "undefined" ? __BUILD_TIME__ : "dev";

/** ビルド時の git コミットハッシュ（short）。define 無しの環境では "dev"。 */
export const BUILD_COMMIT: string =
  typeof __BUILD_COMMIT__ !== "undefined" ? __BUILD_COMMIT__ : "dev";

/** ビルド時刻の表示用整形（端末ロケールの日時。ISO でなければそのまま返す）。 */
export function formatBuildTime(iso: string): string {
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return iso;
  return new Date(ms).toLocaleString();
}
