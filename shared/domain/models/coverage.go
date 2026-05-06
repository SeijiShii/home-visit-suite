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
// SchedulePeriod / Scope / AreaAvailability は 2026-05-06 仕様改訂で全廃され、
// AvailablePeriod に統合された。詳細は available_period.go と
// docs/wants/06_網羅管理.md を参照。
type Coverage struct {
	ID            string         `json:"id"`
	ParentAreaID  string         `json:"parentAreaId"`
	Status        CoverageStatus `json:"status"`
	ActualPercent float64        `json:"actualPercent"` // 実体完了パーセンテージ
	StatusPercent float64        `json:"statusPercent"` // ステータス上の完了パーセンテージ
	CreatedAt     time.Time      `json:"createdAt"`
	UpdatedAt     time.Time      `json:"updatedAt"`
}
