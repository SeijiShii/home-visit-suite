// グループ名の表示・変更 UI（管理者専用）。
// グループ名はアプリレベルのローカルデータで、招待 URL に表示用として同梱される。
// 見出し横に保存済みの現在値をプレビューし、入力との差分（未保存の変更）と
// 保存完了を明示する。他メンバー端末への改名伝播は ScopeNetwork 同期
// （link-self Phase C）待ち。
// 仕様: docs/wants/04_メンバー管理と権限.md「グループ名」

import { useState } from "react";
import { useI18n } from "../contexts/I18nContext";
import { useIdentity } from "../contexts/IdentityContext";
import { getGroupName, setGroupName } from "../lib/group-name";

export function GroupNameSection() {
  const { t } = useI18n();
  const m = t.groupName;
  const { currentRole } = useIdentity();

  const [name, setName] = useState(() => getGroupName() ?? "");
  const [savedName, setSavedName] = useState(() => getGroupName() ?? "");
  const [justSaved, setJustSaved] = useState(false);

  // グループ名の変更は管理者専用（docs/wants/04「グループ名」）。
  if (currentRole !== "admin") return null;

  const dirty = name.trim() !== savedName;

  const handleSave = () => {
    setGroupName(name);
    const now = getGroupName() ?? "";
    setSavedName(now);
    setName(now);
    setJustSaved(true);
    setTimeout(() => setJustSaved(false), 2500);
  };

  return (
    <section className="settings-section">
      <div className="settings-section-heading">
        <h2>{m.section}</h2>
        {savedName && <span className="group-name-preview">{savedName}</span>}
      </div>
      <p className="settings-section-description">{m.description}</p>
      <div className="settings-field">
        <label className="settings-field-label" htmlFor="group-name">
          {m.label}
        </label>
        <input
          id="group-name"
          className="settings-input"
          value={name}
          placeholder={m.placeholder}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && dirty && name.trim()) handleSave();
          }}
        />
      </div>
      <div className="settings-save-row">
        <button
          type="button"
          className="btn btn-primary"
          onClick={handleSave}
          disabled={!dirty || !name.trim()}
        >
          {m.save}
        </button>
        {justSaved ? (
          <span className="settings-status settings-status-saved">
            {m.saved}
          </span>
        ) : dirty ? (
          <span className="settings-status settings-status-dirty">
            {m.unsavedChanges}
          </span>
        ) : null}
      </div>
    </section>
  );
}
