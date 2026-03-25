package models

import "time"

// InvitationType は招待の種別。
type InvitationType string

const (
	InvitationTypeGroupJoin   InvitationType = "group_join"   // LinkSelfグループ招待
	InvitationTypeRolePromote InvitationType = "role_promote" // ロール任命
)

// InvitationStatus は招待の状態。
type InvitationStatus string

const (
	InvitationStatusPending  InvitationStatus = "pending"
	InvitationStatusAccepted InvitationStatus = "accepted"
	InvitationStatusDeclined InvitationStatus = "declined"
)

// Invitation は招待・任命を表す。
type Invitation struct {
	ID          string           `json:"id"`
	Type        InvitationType   `json:"type"`
	Status      InvitationStatus `json:"status"`
	InviterID   string           `json:"inviterId"`  // 招待者のDID
	InviteeID   string           `json:"inviteeId"`  // 対象者のDID
	TargetRole  Role             `json:"targetRole"` // 任命先ロール
	Description string           `json:"description"`
	CreatedAt   time.Time        `json:"createdAt"`
	ResolvedAt  *time.Time       `json:"resolvedAt"`
}
