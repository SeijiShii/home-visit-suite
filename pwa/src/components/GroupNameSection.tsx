// グループ名の表示・変更 UI（管理者専用）。
// グループ名はアプリレベルのローカルデータで、招待 URL に表示用として同梱される。
// 他メンバー端末への改名伝播は ScopeNetwork 同期（link-self Phase C）待ち。
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
  const [saved, setSaved] = useState(false);

  // グループ名の変更は管理者専用（docs/wants/04「グループ名」）。
  if (currentRole !== "admin") return null;

  const handleSave = () => {
    setGroupName(name);
    setName(getGroupName() ?? "");
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <section className="settings-section">
      <h2>{m.section}</h2>
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
        />
      </div>
      <button
        type="button"
        className="btn btn-primary"
        onClick={handleSave}
        disabled={!name.trim()}
      >
        {saved ? m.saved : m.save}
      </button>
    </section>
  );
}
