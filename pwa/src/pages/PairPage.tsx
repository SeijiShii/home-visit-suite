// 端末ペアリング取り込み画面（`#/pair?d=...`）。
// OS のカメラアプリで QR を撮影、または URL をブラウザに入力して開くと表示される。
// - 未登録端末: フラグメントの鍵素材から同一 identity を復元して登録する
// - 登録済み端末: 追加登録せず登録済み ID でそのままアプリを開く（冪等）
// 仕様: docs/wants/01_共通基盤.md「端末ペアリング」（URL 方式・冪等性）

import { useEffect, useState } from "react";
import { AppBrand } from "../components/AppBrand";
import { useI18n } from "../contexts/I18nContext";
import { useIdentity } from "../contexts/IdentityContext";

interface PairPageProps {
  /** 取り込み完了（または冪等スルー）後にアプリへ遷移させる。 */
  onConsumed: () => void;
}

export function PairPage({ onConsumed }: PairPageProps) {
  const { t } = useI18n();
  const m = t.pair;
  const { hasIdentity, completePairing } = useIdentity();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    // 鍵素材をフラグメントごと履歴から除去する。
    const cleanUp = () => {
      try {
        history.replaceState(
          null,
          "",
          `${location.pathname}${location.search}#/`,
        );
      } catch {
        // ignore
      }
    };

    void (async () => {
      if (hasIdentity) {
        // 冪等: 登録済み端末は追加登録せず通常起動する。
        cleanUp();
        if (!cancelled) onConsumed();
        return;
      }
      try {
        await completePairing(window.location.hash);
        cleanUp();
        if (!cancelled) onConsumed();
      } catch (e) {
        console.error("pairing failed", e);
        if (!cancelled) setError(m.error);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [hasIdentity, completePairing, onConsumed, m.error]);

  return (
    <div className="onboarding">
      <div className="onboarding-card">
        <AppBrand />
        <h1 className="onboarding-title">{m.title}</h1>
        {error ? (
          <>
            <p className="onboarding-error">{error}</p>
            <div className="onboarding-actions">
              <button
                type="button"
                className="btn btn-primary"
                onClick={onConsumed}
              >
                {m.toOnboarding}
              </button>
            </div>
          </>
        ) : (
          <p className="onboarding-subtitle">{m.pending}</p>
        )}
      </div>
    </div>
  );
}
