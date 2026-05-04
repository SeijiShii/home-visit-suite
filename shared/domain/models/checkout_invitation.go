package models

import "time"

// DefaultCheckoutInviteTTL は区域招待のデフォルト有効期間。
// 仕様 docs/wants/05_チェックアウト.md「区域招待」: 「デフォルトは発行時刻から 24 時間」
const DefaultCheckoutInviteTTL = 24 * time.Hour

// CheckoutInvitation は区域招待を表す。
// 担当者ではない活動メンバーを、特定のチェックアウト区域に時間制限付きで参加させる仕組み。
// 仕様 docs/wants/05_チェックアウト.md「区域招待」
type CheckoutInvitation struct {
	ID         string     `json:"id"`
	CheckoutID string     `json:"checkoutId"`
	InviteeID  string     `json:"inviteeId"` // 被招待者の DID（活動メンバー）
	InviterID  string     `json:"inviterId"` // 発行者の DID（編集メンバー以上または当該チェックアウトの担当者）
	ExpiresAt  time.Time  `json:"expiresAt"`
	RevokedAt  *time.Time `json:"revokedAt"` // 取り消し時刻、未取消は nil
	CreatedAt  time.Time  `json:"createdAt"`
}

// IsActive は now 時点で招待が有効か（取り消されておらず、期限切れでもない）を返す。
func (i CheckoutInvitation) IsActive(now time.Time) bool {
	if i.RevokedAt != nil {
		return false
	}
	return now.Before(i.ExpiresAt)
}
