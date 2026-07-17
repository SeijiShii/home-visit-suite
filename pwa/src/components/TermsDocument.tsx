// 使用許諾・免責事項の全文表示（同意ゲートと設定画面で共用）。
// 全文の SoT は i18n catalog `terms.*`。
// 仕様: docs/wants/01_共通基盤.md「使用許諾と免責事項」

import { useI18n } from "../contexts/I18nContext";
import { TERMS_VERSION } from "../lib/terms";

export function TermsDocument() {
  const { t } = useI18n();
  const m = t.terms;
  return (
    <div className="terms-document">
      <p className="terms-version">{m.versionLabel(TERMS_VERSION)}</p>
      <h3>{m.aboutHeading}</h3>
      <p>{m.aboutBody}</p>
      <h3>{m.licenseHeading}</h3>
      <p>{m.licenseBody}</p>
      <h3>{m.dataHeading}</h3>
      <ul>
        <li>{m.dataItem1}</li>
        <li>{m.dataItem2}</li>
        <li>{m.dataItem3}</li>
      </ul>
      <h3>{m.disclaimerHeading}</h3>
      <ul>
        <li>{m.disclaimerItem1}</li>
        <li>{m.disclaimerItem2}</li>
        <li>{m.disclaimerItem3}</li>
      </ul>
      <h3>{m.revisionHeading}</h3>
      <p>{m.revisionBody}</p>
    </div>
  );
}
