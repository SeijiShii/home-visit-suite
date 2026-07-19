// 操作マニュアル（docs/wants/12_操作マニュアル.md）のアクセサ。
// 本文データは docs/manual/**/*.md から生成される generated/manual-data.ts が持つ。
// アプリ側はトピック ID を文字列で組み立てず、必ず ManualTopic 型を経由する
// （ページを消すと union 型から消え、参照側が tsc で落ちる＝リンク切れ防止）。

import {
  MANUAL_BASE_LOCALE,
  MANUAL_ORDER,
  MANUAL_PAGES,
  MANUAL_ROUTE_TOPICS,
  type ManualPageData,
  type ManualTopic,
} from "./generated/manual-data";

export { MANUAL_ORDER };
export type { ManualPageData, ManualTopic };

/** ロケールのページを引き、未訳なら執筆言語（ja）へフォールバックする。 */
export function getManualPage(
  topic: ManualTopic,
  locale: string,
): ManualPageData | null {
  return (
    MANUAL_PAGES[locale]?.[topic] ??
    MANUAL_PAGES[MANUAL_BASE_LOCALE]?.[topic] ??
    null
  );
}

/** URL から受け取った文字列が実在のトピックか判定する（未知の ID で落とさないため）。 */
export function isManualTopic(value: string): value is ManualTopic {
  return (MANUAL_ORDER as readonly string[]).includes(value);
}

/** ルートパターン（":param" はワイルドカード）と実際のパスを照合する。 */
function matchRoute(pattern: string, pathname: string): boolean {
  const p = pattern.split("/").filter(Boolean);
  const a = pathname.split("/").filter(Boolean);
  if (p.length !== a.length) return false;
  return p.every((seg, i) => seg.startsWith(":") || seg === a[i]);
}

/**
 * 現在の画面に対応するマニュアルトピックを返す（無ければ null → 目次へ落とす）。
 * ワイルドカードを含まない完全一致を優先する。
 */
export function topicForRoute(pathname: string): ManualTopic | null {
  const matches = MANUAL_ROUTE_TOPICS.filter(([pattern]) =>
    matchRoute(pattern, pathname),
  );
  if (matches.length === 0) return null;
  const exact = matches.find(([pattern]) => !pattern.includes(":"));
  return (exact ?? matches[0])[1];
}
