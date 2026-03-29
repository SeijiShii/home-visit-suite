package models

import "time"

// VisitResult は訪問結果を表す。
type VisitResult string

const (
	VisitResultMet    VisitResult = "met"    // 会えた
	VisitResultAbsent VisitResult = "absent" // 留守
)

// VisitRecord は活動メンバーの訪問記録。
// 個人メモ（Note）はDeviceDBのPersonalNoteに移動済み。
type VisitRecord struct {
	ID         string      `json:"id"`
	UserID     string      `json:"userId"`     // 記録した活動メンバー
	PlaceID    string      `json:"placeId"`    // NULL可: 場所モデルへの参照
	Coord      *Coordinate `json:"coord"`      // NULL可: 場所未登録地点
	AreaID     string      `json:"areaId"`     // 活動中の区域
	ActivityID string      `json:"activityId"` // どの訪問活動での記録か
	Result     VisitResult `json:"result"`
	VisitedAt  time.Time   `json:"visitedAt"`
	CreatedAt  time.Time   `json:"createdAt"`
	UpdatedAt  time.Time   `json:"updatedAt"`
}

// Team は訪問活動チーム。
type Team struct {
	ID       string   `json:"id"`
	Name     string   `json:"name"`
	LeaderID string   `json:"leaderId"` // チーム責任者
	Members  []string `json:"members"`  // メンバーのID
}

// ActivityStatus は訪問活動のステータス。
type ActivityStatus string

const (
	ActivityStatusPending  ActivityStatus = "pending"  // 開始前
	ActivityStatusActive   ActivityStatus = "active"   // 活動中
	ActivityStatusReturned ActivityStatus = "returned" // 返却済み
	ActivityStatusComplete ActivityStatus = "complete" // 完了
)

// CheckoutType は区域チェックアウトの経路を表す。
type CheckoutType string

const (
	CheckoutTypeLending  CheckoutType = "lending"   // 貸し出し（編集staff主体）
	CheckoutTypeSelfTake CheckoutType = "self_take" // 持ち出し（活動staff主体）
)

// Activity は1つの区域の貸し出し（チェックアウト）を表す訪問活動データ。
// 同一区域に対してアクティブなActivityは最大1つ（排他的貸出）。
type Activity struct {
	ID             string         `json:"id"`
	AreaID         string         `json:"areaId"`
	CoveragePlanID string         `json:"coveragePlanId"` // 網羅予定との紐づけ
	CheckoutType   CheckoutType   `json:"checkoutType"`   // 貸出 or 持ち出し
	OwnerID        string         `json:"ownerId"`        // 担当者
	LentByID       string         `json:"lentById"`       // 貸し出した編集staff（持ち出し時は空）
	Status         ActivityStatus `json:"status"`
	CreatedAt      time.Time      `json:"createdAt"`
	ReturnedAt     *time.Time     `json:"returnedAt"`  // 返却日時
	CompletedAt    *time.Time     `json:"completedAt"` // 完了日時
	UpdatedAt      time.Time      `json:"updatedAt"`
}

// ActivityTeamAssignment は訪問活動に対するチームの割り当て。
type ActivityTeamAssignment struct {
	ID           string    `json:"id"`
	ActivityID   string    `json:"activityId"`
	TeamID       string    `json:"teamId"`
	ActivityDate time.Time `json:"activityDate"` // 活動日（日付単位）
	AssignedAt   time.Time `json:"assignedAt"`
}
