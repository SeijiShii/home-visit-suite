package models

import "time"

// AvailabilityType は区域の可用性種別を表す。
type AvailabilityType string

const (
	AvailabilityLendable AvailabilityType = "lendable"  // 貸出可能
	AvailabilitySelfTake AvailabilityType = "self_take" // 持ち出し可能
)

// AreaAvailability は網羅予定内での区域の可用性設定。
type AreaAvailability struct {
	ID             string           `json:"id"`
	CoveragePlanID string           `json:"coveragePlanId"`
	AreaID         string           `json:"areaId"`
	Type           AvailabilityType `json:"type"`
	ScopeGroupID   string           `json:"scopeGroupId"` // ""=全メンバー対象
	StartDate      time.Time        `json:"startDate"`
	EndDate        time.Time        `json:"endDate"`
	SetByID        string           `json:"setById"` // 設定した編集staff
	CreatedAt      time.Time        `json:"createdAt"`
}
