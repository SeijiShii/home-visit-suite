// 訪問記録の編集履歴。
// 参照実装: shared/domain/models/visit_edit.go

export interface VisitRecordEdit {
  id: string;
  visitRecordId: string;
  /** 編集者のDID */
  editorId: string;
  /** 変更前のJSON snapshot */
  oldBody: string;
  /** 変更後のJSON snapshot */
  newBody: string;
  /** ISO 8601 */
  editedAt: string;
}
