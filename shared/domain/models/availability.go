package models

import "time"

// AvailabilityType は区域の可用性種別を表す。
type AvailabilityType string

const (
	AvailabilityLendable AvailabilityType = "lendable"  // 貸出可能
	AvailabilitySelfTake AvailabilityType = "self_take" // 持ち出し可能
)

// AreaAvailability はスコープ内での区域親番の持ち出しステータス設定。
// 期間は親 SchedulePeriod 全体に適用される。
type AreaAvailability struct {
	ID           string           `json:"id"`
	ScopeID      string           `json:"scopeId"`
	AreaID       string           `json:"areaId"` // 区域親番 ID
	Type         AvailabilityType `json:"type"`
	ScopeGroupID string           `json:"scopeGroupId"` // ""=全メンバー対象
	SetByID      string           `json:"setById"`      // 設定した編集staff
	CreatedAt    time.Time        `json:"createdAt"`
}
