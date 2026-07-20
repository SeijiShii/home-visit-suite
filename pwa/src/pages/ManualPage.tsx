// 操作マニュアルのアプリ内ビューア（docs/wants/12_操作マニュアル.md）。
// 本文もスクリーンショットも dist に同梱され vite-plugin-pwa が precache するため、
// 訪問先などオフライン環境でも閲覧できる。

import { useCallback, useEffect, useState } from "react";
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

/**
 * スクリーンショットの拡大表示（docs/wants/12）。
 * 図は 1440px 幅で撮っているため、本文の段組みに収めると細部が読めない。
 */
function ManualLightbox({
  src,
  alt,
  onClose,
}: {
  src: string;
  alt: string;
  onClose: () => void;
}) {
  const { t } = useI18n();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    // 背景が裏でスクロールすると、閉じたときに読んでいた位置を見失う。
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  return (
    <div
      className="manual-lightbox"
      role="dialog"
      aria-modal="true"
      aria-label={alt}
      onClick={onClose}
    >
      <button
        type="button"
        className="manual-lightbox-close"
        aria-label={t.manual.closeImage}
        onClick={onClose}
      >
        ×
      </button>
      {/* 画像自体のクリックでも閉じる（オーバーレイへ伝播させる）。
          拡大したまま操作する要素は無いため、閉じにくくしない。 */}
      <img className="manual-lightbox-image" src={src} alt={alt} />
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
  const [zoomed, setZoomed] = useState<{ src: string; alt: string } | null>(
    null,
  );
  const closeZoom = useCallback(() => setZoomed(null), []);

  // 本文はビルド生成 HTML を差し込むため、個々の図に onClick を付けられない。
  // 図は button で包んであるので、本文コンテナでイベント委譲して受ける。
  const handleBodyClick = useCallback(
    (e: React.MouseEvent<HTMLElement>) => {
      const target = e.target as HTMLElement | null;
      const button = target?.closest?.(".manual-shot-zoom");
      const img = button?.querySelector("img");
      if (!img) return;
      setZoomed({ src: img.getAttribute("src") ?? "", alt: img.alt });
    },
    [],
  );

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
        onClick={handleBodyClick}
        dangerouslySetInnerHTML={{ __html: page.html }}
      />
      {zoomed && (
        <ManualLightbox
          src={zoomed.src}
          alt={zoomed.alt}
          onClose={closeZoom}
        />
      )}
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
