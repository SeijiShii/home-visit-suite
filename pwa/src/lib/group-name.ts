// グループ名（アプリレベルのデータ）のローカル永続。
// LinkSelf 自体にネットワーク名の概念は無いため、home-visit-suite 側で持つ。
// 創設者がオンボーディングで設定し、管理者が /users で変更する。他メンバー端末への
// 伝播は ScopeNetwork 同期（link-self Phase C）待ちで、それまでは招待 URL の
// 表示用パラメータ（参加成立時に保存）が唯一の共有経路。
// 仕様: docs/wants/04_メンバー管理と権限.md「グループ名」

const GROUP_NAME_KEY = "hvs.groupName";

/** 保存済みグループ名。未設定なら null。 */
export function getGroupName(): string | null {
  try {
    return localStorage.getItem(GROUP_NAME_KEY);
  } catch {
    return null;
  }
}

/** グループ名を保存する。空文字は未設定（削除）として扱う。 */
export function setGroupName(name: string): void {
  try {
    const trimmed = name.trim();
    if (trimmed) {
      localStorage.setItem(GROUP_NAME_KEY, trimmed);
    } else {
      localStorage.removeItem(GROUP_NAME_KEY);
    }
  } catch {
    // localStorage 不可の環境（プライベートモード等）では黙って諦める（表示専用データ）。
  }
}
