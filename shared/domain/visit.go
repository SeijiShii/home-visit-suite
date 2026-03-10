package domain

import "time"

// VisitResult は訪問結果を表す。
type VisitResult string

const (
	VisitResultMet    VisitResult = "met"    // 会えた
	VisitResultAbsent VisitResult = "absent" // 留守
)

// VisitRecord は活動スタッフの訪問記録。
type VisitRecord struct {
	ID        string      `json:"id"`
	UserID    string      `json:"userId"`    // 記録した活動スタッフ
	PlaceID   string      `json:"placeId"`   // NULL可: 場所モデルへの参照
	Coord     *Coordinate `json:"coord"`     // NULL可: 場所未登録地点
	AreaID    string      `json:"areaId"`    // 活動中の区域
	Result    VisitResult `json:"result"`
	Note      string      `json:"note"`      // 個人メモ（他メンバーに共有されない）
	VisitedAt time.Time   `json:"visitedAt"`
	CreatedAt time.Time   `json:"createdAt"`
	UpdatedAt time.Time   `json:"updatedAt"`
}

// Team は訪問活動チーム。
type Team struct {
	ID       string   `json:"id"`
	Name     string   `json:"name"`
	LeaderID string   `json:"leaderId"`  // チーム責任者
	Members  []string `json:"members"`   // メンバーのユーザーID
}

// ActivityStatus は訪問活動のステータス。
type ActivityStatus string

const (
	ActivityStatusPending  ActivityStatus = "pending"  // 開始前
	ActivityStatusActive   ActivityStatus = "active"   // 活動中
	ActivityStatusReturned ActivityStatus = "returned" // 返却済み
	ActivityStatusComplete ActivityStatus = "complete" // 完了
)

// Activity は1つの区域の貸し出し（チェックアウト）を表す訪問活動データ。
type Activity struct {
	ID        string         `json:"id"`
	AreaID    string         `json:"areaId"`
	OwnerID   string         `json:"ownerId"`  // 担当者
	Status    ActivityStatus `json:"status"`
	CreatedAt time.Time      `json:"createdAt"`
	UpdatedAt time.Time      `json:"updatedAt"`
}

// ActivityTeamAssignment は訪問活動に対するチームの割り当て。
type ActivityTeamAssignment struct {
	ID         string    `json:"id"`
	ActivityID string    `json:"activityId"`
	TeamID     string    `json:"teamId"`
	AssignedAt time.Time `json:"assignedAt"`
}
