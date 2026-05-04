import { useI18n } from "../contexts/I18nContext";

/**
 * チェックアウト管理画面（編集メンバー以上専用、サイドバーから到達）。
 * Phase G2: プレースホルダー実装（仕様 docs/wants/10_画面設計.md「3. チェックアウト管理」）。
 * Phase G5 で本実装に差し替える。
 */
export function CheckoutsPage() {
  const { t } = useI18n();
  const c = t.checkouts;

  return (
    <>
      <h1>{c.title}</h1>
      <section>
        <h2>{c.active}</h2>
        <p>{c.noActive}</p>
      </section>
      <section>
        <h2>{c.completed}</h2>
        <p>{c.noCompleted}</p>
      </section>
    </>
  );
}
