package models

import "time"

// RequestType は申請の種類を表す。
type RequestType string

const (
	RequestTypePlaceAdd   RequestType = "place_add"    // 場所追加申請
	RequestTypeMapUpdate  RequestType = "map_update"   // 地図情報更新申請
	RequestTypeDoNotVisit RequestType = "do_not_visit" // 訪問不可申請
)

// RequestStatus は申請のステータス。
type RequestStatus string

const (
	RequestStatusPending  RequestStatus = "pending"  // 未処理
	RequestStatusOnHold   RequestStatus = "on_hold"  // 保留
	RequestStatusResolved RequestStatus = "resolved" // 処理済み
)

// Request は活動スタッフからの申請。
type Request struct {
	ID          string        `json:"id"`
	Type        RequestType   `json:"type"`
	Status      RequestStatus `json:"status"`
	SubmitterID string        `json:"submitterId"` // 申請者
	AreaID      string        `json:"areaId"`      // 対象区域
	Coord       *Coordinate   `json:"coord"`       // 場所追加時の座標
	Description string        `json:"description"`
	CreatedAt   time.Time     `json:"createdAt"`
	ResolvedAt  *time.Time    `json:"resolvedAt"`
	ResolvedBy  string        `json:"resolvedBy"` // 処理した編集スタッフ
}
