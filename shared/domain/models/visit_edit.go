package models

import "time"

// VisitRecordEdit は訪問記録の編集履歴。
type VisitRecordEdit struct {
	ID            string    `json:"id"`
	VisitRecordID string    `json:"visitRecordId"`
	EditorID      string    `json:"editorId"` // 編集者のDID
	OldBody       string    `json:"oldBody"`  // 変更前のJSON snapshot
	NewBody       string    `json:"newBody"`  // 変更後のJSON snapshot
	EditedAt      time.Time `json:"editedAt"`
}
