// グループ名（アプリレベルのデータ）のローカル永続。
// LinkSelf 自体にネットワーク名の概念は無いため、home-visit-suite 側で持つ。
// 創設者がオンボーディングで設定し、管理者が /users で変更する。他メンバー端末への
// 伝播は ScopeNetwork 同期（link-self Phase C）待ちで、それまでは招待 URL の
// 表示用パラメータ（参加成立時に保存）が唯一の共有経路。
// 保存先はアクティブなグループスロット（グループ毎に独立。docs/wants/01
// 「グループ毎のローカル DB 分離」）。スロット未作成の環境（テスト等）では
// 旧単一キー `hvs.groupName` にフォールバックする。
// 仕様: docs/wants/04_メンバー管理と権限.md「グループ名」

import { getActiveGroupSlot, setSlotGroupName } from "./group-slots";

const LEGACY_GROUP_NAME_KEY = "hvs.groupName";

/** 保存済みグループ名（アクティブグループのもの）。未設定なら null。 */
export function getGroupName(): string | null {
  const slot = getActiveGroupSlot();
  if (slot) return slot.groupName;
  try {
    return localStorage.getItem(LEGACY_GROUP_NAME_KEY);
  } catch {
    return null;
  }
}

/** アクティブグループのグループ名を保存する。空文字は未設定（削除）として扱う。 */
export function setGroupName(name: string): void {
  const trimmed = name.trim();
  const slot = getActiveGroupSlot();
  if (slot) {
    setSlotGroupName(slot.slotId, trimmed || null);
    return;
  }
  try {
    if (trimmed) {
      localStorage.setItem(LEGACY_GROUP_NAME_KEY, trimmed);
    } else {
      localStorage.removeItem(LEGACY_GROUP_NAME_KEY);
    }
  } catch {
    // localStorage 不可の環境（プライベートモード等）では黙って諦める（表示専用データ）。
  }
}
