// 初回オンボーディング画面。
// 自分の ID がローカルに無いとき（App ゲート）に全ルートへ優先して表示する。
// 新規に ID を作成する（=グループ創設。グループ名も設定する）か、既存の自分の
// 端末から QR で引き継ぐ。
// 仕様: docs/wants/01_共通基盤.md「自分の ID の作成と保管」「端末ペアリング」
//       docs/wants/04_メンバー管理と権限.md「初回オンボーディングと創設メンバー」「グループ名」

import { useCallback, useEffect, useState } from "react";
import { AppBrand } from "../components/AppBrand";
import { useI18n } from "../contexts/I18nContext";
import { useIdentity } from "../contexts/IdentityContext";
import { DEVICE_REMOVED_NOTICE_KEY } from "../lib/full-reset";
import { setGroupName } from "../lib/group-name";

type Mode = "choose" | "create" | "link";

/** デバイス失効による全初期化（lib/full-reset.ts）の直後か。 */
function hasDeviceRemovedNotice(): boolean {
  try {
    return localStorage.getItem(DEVICE_REMOVED_NOTICE_KEY) != null;
  } catch {
    return false;
  }
}

export function OnboardingPage() {
  const { t } = useI18n();
  const m = t.onboarding;
  const { createIdentity, completePairing } = useIdentity();

  // initializer は読むだけにし、フラグの消費（削除）は effect で行う
  // （StrictMode は initializer を二重呼び出しするため、消費を伴うと
  // 2 回目が false になり通知が一度も表示されない）。
  const [wasRemoved] = useState(hasDeviceRemovedNotice);
  useEffect(() => {
    try {
      localStorage.removeItem(DEVICE_REMOVED_NOTICE_KEY);
    } catch {
      // ignore
    }
  }, []);
  const [mode, setMode] = useState<Mode>("choose");
  const [name, setName] = useState("");
  const [groupName, setGroupNameInput] = useState("");
  const [manualCode, setManualCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleCreate = async () => {
    if (!name.trim() || !groupName.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      // 創設者はグループ名も設定する（docs/wants/04「グループ名」）。
      setGroupName(groupName);
      await createIdentity(name);
      // 実 identity での LinkSelf ネットワーク配線は bootstrap（main.tsx）でのみ
      // 行われるため再読込する（JoinPage と同じパターン）。再読込後は App ゲートが
      // hasIdentity=true を検知し通常画面へ遷移する。
      window.location.reload();
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
        // createIdentity 同様、引き継いだ identity でのネットワーク配線には
        // bootstrap の再実行が必要なため再読込する。
        window.location.reload();
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
        <AppBrand />
        <h1 className="onboarding-title">{m.title}</h1>
        <p className="onboarding-subtitle">{m.subtitle}</p>

        {wasRemoved && (
          <p className="onboarding-error" role="status">
            {m.deviceRemovedNotice}
          </p>
        )}

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
            <label className="onboarding-label" htmlFor="onboarding-group-name">
              {m.groupNameLabel}
            </label>
            <input
              id="onboarding-group-name"
              className="onboarding-input"
              value={groupName}
              placeholder={m.groupNamePlaceholder}
              onChange={(e) => setGroupNameInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void handleCreate();
              }}
            />
            <p className="onboarding-hint">{m.groupNameHint}</p>
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
                disabled={!name.trim() || !groupName.trim() || busy}
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
