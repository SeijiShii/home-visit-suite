package domain

import "github.com/SeijiShii/home-visit-suite/shared/domain/models"

// UserRepository はメンバー・タグ・招待の永続化インターフェース。
// メンバーグループ（OrgGroup）概念は廃止済み（2026-05-06 仕様改訂）。
type UserRepository interface {
	// User
	ListUsers() ([]models.User, error)
	GetUser(id string) (*models.User, error)
	SaveUser(user *models.User) error
	DeleteUser(id string) error

	// Tag (メンバータグ)
	ListTags() ([]models.Tag, error)
	SaveTag(tag *models.Tag) error
	DeleteTag(id string) error

	// Invitation
	ListInvitations(inviteeID string) ([]models.Invitation, error)
	GetInvitation(id string) (*models.Invitation, error)
	SaveInvitation(inv *models.Invitation) error
}
