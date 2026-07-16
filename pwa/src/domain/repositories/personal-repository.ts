// 個人データ（DeviceDB格納）の永続化インターフェース。
// 参照実装: shared/domain/personal_repository.go

import type {
  PersonalNote,
  PersonalTag,
  PersonalTagAssignment,
} from "../models/personal";

export interface PersonalRepository {
  // PersonalNote
  getPersonalNote(visitRecordId: string): Promise<PersonalNote | null>;
  savePersonalNote(note: PersonalNote): Promise<void>;
  deletePersonalNote(id: string): Promise<void>;

  // PersonalTag
  listPersonalTags(): Promise<PersonalTag[]>;
  savePersonalTag(tag: PersonalTag): Promise<void>;
  deletePersonalTag(id: string): Promise<void>;

  // PersonalTagAssignment
  listPersonalTagAssignments(
    visitRecordId: string,
  ): Promise<PersonalTagAssignment[]>;
  savePersonalTagAssignment(a: PersonalTagAssignment): Promise<void>;
  deletePersonalTagAssignment(id: string): Promise<void>;

  // AppSettings (key-value)

  /** 非表示化されたヘルプ tip キーの一覧を返す。初期状態では空配列を返し、エラーにはしない。 */
  getHiddenTipKeys(): Promise<string[]>;
  /** 指定キーを非表示リストに追加する。既に存在する場合は何もしない。 */
  addHiddenTipKey(key: string): Promise<void>;
  /** 非表示リストを全消去する。 */
  clearHiddenTipKeys(): Promise<void>;

  /** 保存済みの UI 言語コード ("ja"/"en" 等) を返す。未設定の場合は空文字。 */
  getLocale(): Promise<string>;
  /** UI 言語コードを保存する。 */
  setLocale(locale: string): Promise<void>;

  /** 区域詳細編集モードの隣接半径(km)を返す。未設定時は 0 を返す。 */
  getAreaDetailRadiusKm(): Promise<number>;
  /** 隣接半径(km)を保存する。 */
  setAreaDetailRadiusKm(km: number): Promise<void>;
}
