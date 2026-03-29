package models

import "time"

// PersonalNote は訪問記録に紐づく個人メモ（DeviceDBに格納、他メンバーに共有されない）。
type PersonalNote struct {
	ID            string    `json:"id"`
	VisitRecordID string    `json:"visitRecordId"`
	Note          string    `json:"note"`
	CreatedAt     time.Time `json:"createdAt"`
	UpdatedAt     time.Time `json:"updatedAt"`
}

// PersonalTag は活動メンバーが個人的に定義するタグ（DeviceDB）。
type PersonalTag struct {
	ID   string `json:"id"`
	Name string `json:"name"`
}

// PersonalTagAssignment はタグと訪問記録の紐づけ（DeviceDB）。
type PersonalTagAssignment struct {
	ID            string `json:"id"`
	TagID         string `json:"tagId"`
	VisitRecordID string `json:"visitRecordId"`
}
