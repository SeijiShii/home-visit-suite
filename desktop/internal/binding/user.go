package binding

import (
	"github.com/SeijiShii/home-visit-suite/shared/domain"
	"github.com/SeijiShii/home-visit-suite/shared/domain/models"
)

// UserBinding はユーザー・グループ管理のフロントエンド向けAPI。
type UserBinding struct {
	repo domain.UserRepository
}

func NewUserBinding(repo domain.UserRepository) *UserBinding {
	return &UserBinding{repo: repo}
}

// --- User ---

func (b *UserBinding) ListUsers() ([]models.User, error) {
	return b.repo.ListUsers()
}

func (b *UserBinding) GetUser(id string) (*models.User, error) {
	return b.repo.GetUser(id)
}

func (b *UserBinding) SaveUser(user *models.User) error {
	return b.repo.SaveUser(user)
}

func (b *UserBinding) DeleteUser(id string) error {
	return b.repo.DeleteUser(id)
}

// --- Group ---

func (b *UserBinding) ListGroups() ([]models.Group, error) {
	return b.repo.ListGroups()
}

func (b *UserBinding) GetGroup(id string) (*models.Group, error) {
	return b.repo.GetGroup(id)
}

func (b *UserBinding) SaveGroup(group *models.Group) error {
	return b.repo.SaveGroup(group)
}

func (b *UserBinding) DeleteGroup(id string) error {
	return b.repo.DeleteGroup(id)
}

// --- Tag ---

func (b *UserBinding) ListTags() ([]models.Tag, error) {
	return b.repo.ListTags()
}

func (b *UserBinding) SaveTag(tag *models.Tag) error {
	return b.repo.SaveTag(tag)
}

func (b *UserBinding) DeleteTag(id string) error {
	return b.repo.DeleteTag(id)
}

// --- Invitation ---

func (b *UserBinding) ListInvitations(inviteeID string) ([]models.Invitation, error) {
	return b.repo.ListInvitations(inviteeID)
}

func (b *UserBinding) SaveInvitation(inv *models.Invitation) error {
	return b.repo.SaveInvitation(inv)
}
