package models

import "time"

// RequestType は申請の種類を表す。
type RequestType string

const (
	RequestTypePlaceAdd        RequestType = "place_add"         // 場所作成申請（活動メンバーが未登録地点を追加）
	RequestTypePlaceInfoModify RequestType = "place_info_modify" // 場所情報修正申請（既存場所の情報修正依頼）
	RequestTypeMapUpdate       RequestType = "map_update"        // 地図情報更新申請（廃屋・更地化・新築等）
	RequestTypeDoNotVisit      RequestType = "do_not_visit"      // 訪問拒否宅報告
)

// RequestStatus は申請のステータス。
type RequestStatus string

const (
	RequestStatusPending  RequestStatus = "pending"  // 未処理
	RequestStatusOnHold   RequestStatus = "on_hold"  // 保留
	RequestStatusResolved RequestStatus = "resolved" // 処理済み
)

// Request は活動メンバーからの申請。
type Request struct {
	ID          string        `json:"id"`
	Type        RequestType   `json:"type"`
	Status      RequestStatus `json:"status"`
	SubmitterID string        `json:"submitterId"` // 申請者
	AreaID      string        `json:"areaId"`      // 対象区域
	PlaceID     string        `json:"placeId"`     // 既存場所への申請対象（place_add は空）
	Coord       *Coordinate   `json:"coord"`       // 場所追加時の座標
	Description string        `json:"description"`
	CreatedAt   time.Time     `json:"createdAt"`
	ResolvedAt  *time.Time    `json:"resolvedAt"`
	ResolvedBy  string        `json:"resolvedBy"` // 処理した編集メンバー
}
