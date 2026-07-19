// アプリ内の各所から操作マニュアルへ飛ぶための唯一の導線
// （docs/wants/12_操作マニュアル.md「トピック ID の型生成」）。
//
// topic は ManualTopic 型なので、マニュアルページを削除・改名して ID が消えると
// このコンポーネントの呼び出し側が tsc で落ちる。URL を手書きしないこと。

import { Link } from "react-router-dom";
import { useI18n } from "../contexts/I18nContext";
import { getManualPage, type ManualTopic } from "../manual";

interface ManualLinkProps {
  topic: ManualTopic;
  /** 省略時はマニュアルページの見出しを表示する */
  children?: React.ReactNode;
  className?: string;
}

export function ManualLink({ topic, children, className }: ManualLinkProps) {
  const { locale } = useI18n();
  const page = getManualPage(topic, locale);
  return (
    <Link
      to={`/manual/${topic}`}
      className={className ? `manual-link ${className}` : "manual-link"}
    >
      {children ?? page?.title ?? topic}
    </Link>
  );
}
