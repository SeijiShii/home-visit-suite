package models

import "time"

// CoverageStatus は網羅活動のステータス。
type CoverageStatus string

const (
	CoverageStatusPlanned   CoverageStatus = "planned"   // 予定
	CoverageStatusActive    CoverageStatus = "active"    // 進行中
	CoverageStatusCompleted CoverageStatus = "completed" // 完了
)

// Coverage は区域親番単位の網羅活動データ。
type Coverage struct {
	ID            string         `json:"id"`
	ParentAreaID  string         `json:"parentAreaId"`
	Status        CoverageStatus `json:"status"`
	ActualPercent float64        `json:"actualPercent"` // 実体完了パーセンテージ
	StatusPercent float64        `json:"statusPercent"` // ステータス上の完了パーセンテージ
	CreatedAt     time.Time      `json:"createdAt"`
	UpdatedAt     time.Time      `json:"updatedAt"`
}

// CoveragePlan は網羅予定。グループごとに期間と区域親番を割り当てる。
type CoveragePlan struct {
	ID         string    `json:"id"`
	CoverageID string    `json:"coverageId"`
	GroupID    string    `json:"groupId"`
	StartDate  time.Time `json:"startDate"`
	EndDate    time.Time `json:"endDate"`
	Approved   bool      `json:"approved"` // 承認フロー対象
}
