import { useI18n } from "../contexts/I18nContext";
import { useTips, type TipInstance } from "../contexts/TipsContext";

interface TipCardProps {
  tip: TipInstance;
}

function resolveTipMessage(
  t: ReturnType<typeof useI18n>["t"],
  key: string,
): string {
  // i18n キー "tips.map.polygon.startDraw" を辿って文字列を取得
  const parts = key.split(".");
  let node: unknown = t;
  for (const p of parts) {
    if (
      node &&
      typeof node === "object" &&
      p in (node as Record<string, unknown>)
    ) {
      node = (node as Record<string, unknown>)[p];
    } else {
      return key; // フォールバック: キーそのまま
    }
  }
  return typeof node === "string" ? node : key;
}

export function TipCard({ tip }: TipCardProps) {
  const { t } = useI18n();
  const { hideTip } = useTips();
  const message = resolveTipMessage(t, tip.key);

  return (
    <div
      className={`tip-card${tip.exiting ? " tip-card--exiting" : ""}`}
      role="status"
      aria-live="polite"
      data-tip-key={tip.key}
    >
      <span className="tip-card__message">{message}</span>
      <button
        type="button"
        className="tip-card__dismiss"
        onClick={() => {
          void hideTip(tip.key);
        }}
      >
        {t.tips.dontShowAgain}
      </button>
    </div>
  );
}
