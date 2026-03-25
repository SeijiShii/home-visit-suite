package models

import "time"

// NotificationType は通知の種別。
type NotificationType string

const (
	NotificationTypeInvitation    NotificationType = "invitation"     // 任命招待
	NotificationTypeLending       NotificationType = "lending"        // 区域の貸し出し
	NotificationTypeReturn        NotificationType = "return"         // 返却
	NotificationTypeForceReturn   NotificationType = "force_return"   // 強制回収
	NotificationTypeRequestResult NotificationType = "request_result" // 申請結果
)

// Notification は通知を表す。
type Notification struct {
	ID          string           `json:"id"`
	Type        NotificationType `json:"type"`
	TargetID    string           `json:"targetId"`    // 宛先DID
	ReferenceID string           `json:"referenceId"` // 関連エンティティID
	Message     string           `json:"message"`
	Read        bool             `json:"read"`
	CreatedAt   time.Time        `json:"createdAt"`
	ExpiresAt   *time.Time       `json:"expiresAt"` // 表示期限
}
