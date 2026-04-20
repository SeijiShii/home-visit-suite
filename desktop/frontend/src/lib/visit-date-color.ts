/**
 * 訪問日の経過日数に応じた色分け CSS クラス。
 * 仕様 docs/wants/08_活動メンバー向けアプリ.md 「訪問記録ダイアログ」
 *   1ヶ月以内: 赤 (last-met-recent)
 *   半年以内: オレンジ (last-met-mid)
 *   それ以上: 黒 (last-met-old)
 */

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const ONE_MONTH_DAYS = 30;
const SIX_MONTHS_DAYS = 182;

export function lastVisitColorClass(date: Date | null): string {
  if (!date) return "";
  const days = Math.floor((Date.now() - date.getTime()) / MS_PER_DAY);
  if (days <= ONE_MONTH_DAYS) return "last-met-recent";
  if (days <= SIX_MONTHS_DAYS) return "last-met-mid";
  return "last-met-old";
}
