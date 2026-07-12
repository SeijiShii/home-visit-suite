// 初回オンボーディング画面。
// 自分の ID がローカルに無いとき（App ゲート）に全ルートへ優先して表示する。
// 新規に ID を作成するか、既存の自分の端末から QR で引き継ぐ。
// 仕様: docs/wants/01_共通基盤.md「自分の ID の作成と保管」「端末ペアリング」
//       docs/wants/04_メンバー管理と権限.md「初回オンボーディングと創設メンバー」

import { useCallback, useState } from "react";
import { useI18n } from "../contexts/I18nContext";
import { useIdentity } from "../contexts/IdentityContext";

type Mode = "choose" | "create" | "link";

export function OnboardingPage() {
  const { t } = useI18n();
  const m = t.onboarding;
  const { createIdentity, completePairing } = useIdentity();

  const [mode, setMode] = useState<Mode>("choose");
  const [name, setName] = useState("");
  const [manualCode, setManualCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleCreate = async () => {
    if (!name.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      await createIdentity(name);
      // 成功時は App ゲートが hasIdentity=true を検知し通常画面へ遷移する。
    } catch (e) {
      console.error("createIdentity failed", e);
      setError(m.createError);
      setBusy(false);
    }
  };

  const handlePairing = useCallback(
    async (text: string) => {
      if (busy) return;
      setBusy(true);
      setError(null);
      try {
        await completePairing(text);
      } catch (e) {
        console.error("completePairing failed", e);
        setError(m.invalidCode);
        setBusy(false);
      }
    },
    [busy, completePairing, m.invalidCode],
  );

  return (
    <div className="onboarding">
      <div className="onboarding-card">
        <h1 className="onboarding-title">{m.title}</h1>
        <p className="onboarding-subtitle">{m.subtitle}</p>

        {mode === "choose" && (
          <div className="onboarding-options">
            <button
              type="button"
              className="onboarding-option"
              onClick={() => {
                setError(null);
                setMode("create");
              }}
            >
              <span className="onboarding-option-title">{m.createOption}</span>
              <span className="onboarding-option-desc">
                {m.createOptionDesc}
              </span>
            </button>
            <button
              type="button"
              className="onboarding-option"
              onClick={() => {
                setError(null);
                setMode("link");
              }}
            >
              <span className="onboarding-option-title">{m.linkOption}</span>
              <span className="onboarding-option-desc">{m.linkOptionDesc}</span>
            </button>
          </div>
        )}

        {mode === "create" && (
          <div className="onboarding-form">
            <label className="onboarding-label" htmlFor="onboarding-name">
              {m.nameLabel}
            </label>
            <input
              id="onboarding-name"
              className="onboarding-input"
              value={name}
              placeholder={m.namePlaceholder}
              autoFocus
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void handleCreate();
              }}
            />
            {error && <p className="onboarding-error">{error}</p>}
            <div className="onboarding-actions">
              <button
                type="button"
                className="btn"
                onClick={() => setMode("choose")}
                disabled={busy}
              >
                {m.back}
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => void handleCreate()}
                disabled={!name.trim() || busy}
              >
                {busy ? m.creating : m.start}
              </button>
            </div>
          </div>
        )}

        {mode === "link" && (
          <div className="onboarding-form">
            <p className="onboarding-hint">{m.linkHint}</p>
            <label className="onboarding-label" htmlFor="onboarding-code">
              {m.manualCodeLabel}
            </label>
            <textarea
              id="onboarding-code"
              className="onboarding-textarea"
              value={manualCode}
              placeholder={m.manualCodePlaceholder}
              onChange={(e) => setManualCode(e.target.value)}
            />
            {error && <p className="onboarding-error">{error}</p>}
            <div className="onboarding-actions">
              <button
                type="button"
                className="btn"
                onClick={() => setMode("choose")}
                disabled={busy}
              >
                {m.back}
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => void handlePairing(manualCode)}
                disabled={!manualCode.trim() || busy}
              >
                {m.submitLink}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
