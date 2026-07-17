// 使用許諾・免責事項の同意ゲート画面。
// 未同意（または規約改定後）の起動時に、全ルート（ペアリング・グループ参加・
// オンボーディングを含む）へ優先して表示する。ハッシュ URL は消費しないため、
// 同意後は本来の遷移へそのまま進む。
// 仕様: docs/wants/01_共通基盤.md「使用許諾と免責事項」、10_画面設計.md #15

import { AppBrand } from "../components/AppBrand";
import { TermsDocument } from "../components/TermsDocument";
import { useI18n } from "../contexts/I18nContext";
import { acceptTerms } from "../lib/terms";

export function TermsGatePage({ onAccept }: { onAccept: () => void }) {
  const { t } = useI18n();
  return (
    <div className="onboarding">
      <div className="onboarding-card terms-card">
        <AppBrand />
        <h1 className="onboarding-title">{t.terms.title}</h1>
        <p className="onboarding-subtitle">{t.terms.gateHint}</p>
        <div className="terms-document-scroll">
          <TermsDocument />
        </div>
        <div className="onboarding-actions">
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => {
              acceptTerms();
              onAccept();
            }}
          >
            {t.terms.agree}
          </button>
        </div>
      </div>
    </div>
  );
}
