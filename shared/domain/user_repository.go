package domain

import "github.com/SeijiShii/home-visit-suite/shared/domain/models"

// UserRepository はメンバー・グループ・招待の永続化インターフェース。
type UserRepository interface {
	// User
	ListUsers() ([]models.User, error)
	GetUser(id string) (*models.User, error)
	SaveUser(user *models.User) error
	DeleteUser(id string) error

	// Group (組織グループ)
	ListGroups() ([]models.Group, error)
	GetGroup(id string) (*models.Group, error)
	SaveGroup(group *models.Group) error
	DeleteGroup(id string) error

	// Tag (メンバータグ)
	ListTags() ([]models.Tag, error)
	SaveTag(tag *models.Tag) error
	DeleteTag(id string) error

	// Invitation
	ListInvitations(inviteeID string) ([]models.Invitation, error)
	GetInvitation(id string) (*models.Invitation, error)
	SaveInvitation(inv *models.Invitation) error
}
