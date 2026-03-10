// Package service はビジネスロジックのインターフェースを定義する。
package service

import "github.com/SeijiShii/home-visit-suite/shared/domain"

// AuthService は権限管理のビジネスロジック。
type AuthService interface {
	// CanPerform は指定ロールが操作を実行できるか判定する。
	CanPerform(actor domain.Role, action string) bool

	// InviteToRole はロール任命招待を送る。
	InviteToRole(actorID string, targetID string, newRole domain.Role) error

	// DismissRole はロール罷免を行う。
	DismissRole(actorID string, targetID string, newRole domain.Role) error
}
