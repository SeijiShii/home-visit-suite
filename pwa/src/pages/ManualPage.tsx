// 操作マニュアルのアプリ内ビューア（docs/wants/12_操作マニュアル.md）。
// 本文もスクリーンショットも dist に同梱され vite-plugin-pwa が precache するため、
// 訪問先などオフライン環境でも閲覧できる。

import { Link, useParams } from "react-router-dom";
import { useI18n } from "../contexts/I18nContext";
import {
  MANUAL_ORDER,
  getManualPage,
  isManualTopic,
  type ManualTopic,
} from "../manual";

/** 目次。 */
function ManualIndex({ locale }: { locale: string }) {
  const { t } = useI18n();
  return (
    <div className="manual-page">
      <h1>{t.manual.title}</h1>
      <ul className="manual-index">
        {MANUAL_ORDER.map((topic) => {
          const page = getManualPage(topic, locale);
          if (!page) return null;
          return (
            <li key={topic} className="manual-index-item">
              <Link className="manual-index-link" to={`/manual/${topic}`}>
                {page.title}
              </Link>
              {page.status === "draft" && (
                <span className="manual-badge manual-badge-draft">
                  {t.manual.draft}
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** 1 トピックの本文。 */
function ManualArticle({
  topic,
  locale,
}: {
  topic: ManualTopic;
  locale: string;
}) {
  const { t } = useI18n();
  const page = getManualPage(topic, locale);
  if (!page) return <ManualNotFound />;

  return (
    <div className="manual-page">
      <Link className="manual-back" to="/manual">
        {t.manual.backToIndex}
      </Link>
      <h1>{page.title}</h1>
      {page.status === "draft" && (
        <p className="manual-notice">{t.manual.draftNotice}</p>
      )}
      {/* stale = sources の変更後に本文が未更新。開発ビルドのみ表示し、
          利用者には出さない（更新は開発側のタスクのため）。 */}
      {page.stale && import.meta.env.DEV && (
        <p className="manual-notice manual-notice-stale">
          {t.manual.staleNotice}
        </p>
      )}
      {/* 本文はリポジトリ内の Markdown をビルド時に HTML 化したもの。
          外部入力は含まれないため dangerouslySetInnerHTML で差し込む。 */}
      <article
        className="manual-body"
        dangerouslySetInnerHTML={{ __html: page.html }}
      />
    </div>
  );
}

function ManualNotFound() {
  const { t } = useI18n();
  return (
    <div className="manual-page">
      <h1>{t.manual.title}</h1>
      <p className="manual-notice">{t.manual.notFound}</p>
      <Link className="manual-back" to="/manual">
        {t.manual.backToIndex}
      </Link>
    </div>
  );
}

export function ManualPage() {
  const { locale } = useI18n();
  const { topic } = useParams<{ topic?: string }>();
  if (!topic) return <ManualIndex locale={locale} />;
  if (!isManualTopic(topic)) return <ManualNotFound />;
  return <ManualArticle topic={topic} locale={locale} />;
}
