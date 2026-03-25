// Package service はビジネスロジックのインターフェースと実装を提供する。
package service

import "github.com/SeijiShii/home-visit-suite/shared/domain/models"

// AuthService は権限管理のビジネスロジック。
type AuthService interface {
	// CanPerform は指定ロールが操作を実行できるか判定する。
	CanPerform(actor models.Role, action string) bool

	// InviteToRole はロール任命招待を送る。admin/editor+のみ。
	InviteToRole(actorID string, targetID string, newRole models.Role) (*models.Invitation, error)

	// AcceptInvitation は招待を受理する。
	AcceptInvitation(actorID string, invitationID string) error

	// DismissRole はロール降格を行う。
	// 管理者の自己罷免は不可。最後の管理者の罷免も不可。
	DismissRole(actorID string, targetID string, newRole models.Role) error

	// RemoveMember はメンバーをグループから削除する。admin only。
	// 担当Activity等をクリアする。
	RemoveMember(actorID string, targetID string) error
}
