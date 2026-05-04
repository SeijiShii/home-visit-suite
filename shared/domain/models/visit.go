package models

import "time"

// VisitResult は訪問結果を表す。
type VisitResult string

const (
	VisitResultMet             VisitResult = "met"              // 会えた
	VisitResultAbsent          VisitResult = "absent"           // 留守
	VisitResultVacantPossible  VisitResult = "vacant_possible"  // 空き家（入居の可能性あり）
	VisitResultVacantAbandoned VisitResult = "vacant_abandoned" // 空き家（廃屋）または更地
	VisitResultRefused         VisitResult = "refused"          // 訪問を望まない
)

// RequiresApplication は当該ステータス選択時に申請（テキスト入力 + 編集メンバータスク化）を伴うかを返す。
// 空き家（廃屋）または更地 → 地図情報更新申請
// 訪問を望まない → 訪問拒否宅報告
func (r VisitResult) RequiresApplication() bool {
	switch r {
	case VisitResultVacantAbandoned, VisitResultRefused:
		return true
	default:
		return false
	}
}

// VisitRecord は活動メンバーの訪問記録。
// 個人メモ（Note）はDeviceDBのPersonalNoteに移動済み。
type VisitRecord struct {
	ID               string      `json:"id"`
	UserID           string      `json:"userId"`     // 記録した活動メンバー
	PlaceID          string      `json:"placeId"`    // NULL可: 場所モデルへの参照
	Coord            *Coordinate `json:"coord"`      // NULL可: 場所未登録地点
	AreaID           string      `json:"areaId"`     // 活動中の区域
	CheckoutID       string      `json:"activityId"` // どのチェックアウトでの記録か（Phase 1 暫定では空文字許容、本実装で NOT NULL）。JSON タグは旧名 `activityId` のまま維持してフロントエンド互換を保つ（フロントエンドリネームは別フェーズで対応）
	Result           VisitResult `json:"result"`
	AppliedRequestID *string     `json:"appliedRequestId"` // 申請を伴うステータス時の Request 参照
	VisitedAt        time.Time   `json:"visitedAt"`
	CreatedAt        time.Time   `json:"createdAt"`
	UpdatedAt        time.Time   `json:"updatedAt"`
}

// CheckoutStatus はチェックアウトのステータス。
type CheckoutStatus string

const (
	CheckoutStatusPending  CheckoutStatus = "pending"  // 開始前
	CheckoutStatusActive   CheckoutStatus = "active"   // 活動中
	CheckoutStatusReturned CheckoutStatus = "returned" // 返却済み
	CheckoutStatusComplete CheckoutStatus = "complete" // 完了
)

// CheckoutType は区域チェックアウトの経路を表す。
type CheckoutType string

const (
	CheckoutTypeLending  CheckoutType = "lending"   // 貸し出し（編集メンバー主体）
	CheckoutTypeSelfTake CheckoutType = "self_take" // 持ち出し（活動メンバー主体）
)

// Checkout は1つの区域の貸し出し（チェックアウト）データ。
// 同一区域に対してアクティブなチェックアウトは最大1つ（排他的貸出）。
type Checkout struct {
	ID           string         `json:"id"`
	AreaID       string         `json:"areaId"`
	ScopeID      string         `json:"scopeId"`      // スコープとの紐づけ
	CheckoutType CheckoutType   `json:"checkoutType"` // 貸出 or 持ち出し
	OwnerID      string         `json:"ownerId"`      // 担当者
	LentByID     string         `json:"lentById"`     // 貸し出した編集メンバー（持ち出し時は空、編集メンバーが自分自身に貸し出した場合は OwnerID と同じ）
	Status       CheckoutStatus `json:"status"`
	CreatedAt    time.Time      `json:"createdAt"`
	ReturnedAt   *time.Time     `json:"returnedAt"`  // 返却日時
	CompletedAt  *time.Time     `json:"completedAt"` // 完了日時
	UpdatedAt    time.Time      `json:"updatedAt"`
}
