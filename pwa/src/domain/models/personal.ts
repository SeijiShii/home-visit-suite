// 個人スコープ（DeviceDB 格納、他メンバーに共有されない）のドメインモデル。
// 仕様: docs/wants/08_活動メンバー向けアプリ.md
// 参照実装: shared/domain/models/personal.go

/** 訪問記録に紐づく個人メモ。 */
export interface PersonalNote {
  id: string;
  visitRecordId: string;
  note: string;
  /** ISO 8601 */
  createdAt: string;
  /** ISO 8601 */
  updatedAt: string;
}

/** 活動メンバーが個人的に定義するタグ。 */
export interface PersonalTag {
  id: string;
  name: string;
}

/** タグと訪問記録の紐づけ。 */
export interface PersonalTagAssignment {
  id: string;
  tagId: string;
  visitRecordId: string;
}
