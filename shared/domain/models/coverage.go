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

// SchedulePeriod は予定期間。複数の期間は時間的に重複できない。
type SchedulePeriod struct {
	ID        string    `json:"id"`
	Name      string    `json:"name"`
	StartDate time.Time `json:"startDate"`
	EndDate   time.Time `json:"endDate"`
	Approved  bool      `json:"approved"` // 承認フロー対象
	CreatedAt time.Time `json:"createdAt"`
	UpdatedAt time.Time `json:"updatedAt"`
}

// Scope はスコープ。予定期間内で区域親番をグループまたは任意名称に割り当てる。
// GroupID が空でない場合はグループスコープ（メンバーグループからコピー）。
// 同一 SchedulePeriod 内で ParentAreaID は一つの Scope にのみ属せる。
type Scope struct {
	ID               string    `json:"id"`
	SchedulePeriodID string    `json:"schedulePeriodId"`
	Name             string    `json:"name"`
	GroupID          string    `json:"groupId"`       // ""=グループ外スコープ
	ParentAreaIDs    []string  `json:"parentAreaIds"` // 対象区域親番リスト
	CreatedAt        time.Time `json:"createdAt"`
	UpdatedAt        time.Time `json:"updatedAt"`
}
