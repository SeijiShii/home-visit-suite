package repository

import (
	"fmt"
	"sort"
	"sync"

	"github.com/SeijiShii/home-visit-suite/shared/domain/models"
)

type InMemoryUserRepository struct {
	mu          sync.RWMutex
	users       map[string]*models.User
	groups      map[string]*models.Group
	tags        map[string]*models.Tag
	invitations map[string]*models.Invitation
}

func NewInMemoryUserRepository() *InMemoryUserRepository {
	return &InMemoryUserRepository{
		users:       make(map[string]*models.User),
		groups:      make(map[string]*models.Group),
		tags:        make(map[string]*models.Tag),
		invitations: make(map[string]*models.Invitation),
	}
}

// --- User ---

func (r *InMemoryUserRepository) ListUsers() ([]models.User, error) {
	r.mu.RLock()
	defer r.mu.RUnlock()

	result := make([]models.User, 0, len(r.users))
	for _, v := range r.users {
		result = append(result, *v)
	}
	sort.Slice(result, func(i, j int) bool {
		return result[i].ID < result[j].ID
	})
	return result, nil
}

func (r *InMemoryUserRepository) GetUser(id string) (*models.User, error) {
	r.mu.RLock()
	defer r.mu.RUnlock()

	v, ok := r.users[id]
	if !ok {
		return nil, fmt.Errorf("user not found: %s", id)
	}
	copy := *v
	return &copy, nil
}

func (r *InMemoryUserRepository) SaveUser(user *models.User) error {
	if len(user.TagIDs) > 10 {
		return fmt.Errorf("a member can have at most 10 tags (got %d)", len(user.TagIDs))
	}

	r.mu.Lock()
	defer r.mu.Unlock()

	copy := *user
	r.users[user.ID] = &copy
	return nil
}

func (r *InMemoryUserRepository) DeleteUser(id string) error {
	r.mu.Lock()
	defer r.mu.Unlock()

	if _, ok := r.users[id]; !ok {
		return fmt.Errorf("user not found: %s", id)
	}
	delete(r.users, id)
	return nil
}

// --- Group ---

func (r *InMemoryUserRepository) ListGroups() ([]models.Group, error) {
	r.mu.RLock()
	defer r.mu.RUnlock()

	result := make([]models.Group, 0, len(r.groups))
	for _, v := range r.groups {
		result = append(result, *v)
	}
	sort.Slice(result, func(i, j int) bool {
		return result[i].SortOrder < result[j].SortOrder
	})
	return result, nil
}

func (r *InMemoryUserRepository) GetGroup(id string) (*models.Group, error) {
	r.mu.RLock()
	defer r.mu.RUnlock()

	v, ok := r.groups[id]
	if !ok {
		return nil, fmt.Errorf("group not found: %s", id)
	}
	copy := *v
	return &copy, nil
}

func (r *InMemoryUserRepository) SaveGroup(group *models.Group) error {
	r.mu.Lock()
	defer r.mu.Unlock()

	copy := *group
	r.groups[group.ID] = &copy
	return nil
}

func (r *InMemoryUserRepository) DeleteGroup(id string) error {
	r.mu.Lock()
	defer r.mu.Unlock()

	if _, ok := r.groups[id]; !ok {
		return fmt.Errorf("group not found: %s", id)
	}
	delete(r.groups, id)
	return nil
}

// --- Tag ---

func (r *InMemoryUserRepository) ListTags() ([]models.Tag, error) {
	r.mu.RLock()
	defer r.mu.RUnlock()

	result := make([]models.Tag, 0, len(r.tags))
	for _, v := range r.tags {
		result = append(result, *v)
	}
	sort.Slice(result, func(i, j int) bool {
		return result[i].ID < result[j].ID
	})
	return result, nil
}

func (r *InMemoryUserRepository) SaveTag(tag *models.Tag) error {
	if err := tag.Validate(); err != nil {
		return err
	}

	r.mu.Lock()
	defer r.mu.Unlock()

	// Duplicate name check (case-sensitive). Allow update of same ID.
	for _, existing := range r.tags {
		if existing.Name == tag.Name && existing.ID != tag.ID {
			return fmt.Errorf("tag name %q already exists", tag.Name)
		}
	}

	// Auto-assign color from palette if empty
	if tag.Color == "" {
		used := make(map[string]bool, len(r.tags))
		for _, t := range r.tags {
			used[t.Color] = true
		}
		for _, c := range models.TagColorPalette {
			if !used[c] {
				tag.Color = c
				break
			}
		}
		// All palette colors used — cycle back to first
		if tag.Color == "" {
			tag.Color = models.TagColorPalette[0]
		}
	}

	copy := *tag
	r.tags[tag.ID] = &copy
	return nil
}

func (r *InMemoryUserRepository) DeleteTag(id string) error {
	r.mu.Lock()
	defer r.mu.Unlock()

	if _, ok := r.tags[id]; !ok {
		return fmt.Errorf("tag not found: %s", id)
	}
	delete(r.tags, id)
	return nil
}

// --- Invitation ---

func (r *InMemoryUserRepository) ListInvitations(inviteeID string) ([]models.Invitation, error) {
	r.mu.RLock()
	defer r.mu.RUnlock()

	var result []models.Invitation
	for _, v := range r.invitations {
		if v.InviteeID == inviteeID {
			result = append(result, *v)
		}
	}
	return result, nil
}

func (r *InMemoryUserRepository) GetInvitation(id string) (*models.Invitation, error) {
	r.mu.RLock()
	defer r.mu.RUnlock()

	v, ok := r.invitations[id]
	if !ok {
		return nil, fmt.Errorf("invitation not found: %s", id)
	}
	copy := *v
	return &copy, nil
}

func (r *InMemoryUserRepository) SaveInvitation(inv *models.Invitation) error {
	r.mu.Lock()
	defer r.mu.Unlock()

	copy := *inv
	r.invitations[inv.ID] = &copy
	return nil
}
