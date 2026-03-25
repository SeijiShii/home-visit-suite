package service

import (
	"fmt"
	"time"

	"github.com/SeijiShii/home-visit-suite/shared/domain"
	"github.com/SeijiShii/home-visit-suite/shared/domain/models"
)

// actionMinRole は操作ごとの最低ロール。
var actionMinRole = map[string]models.Role{
	"manage_users": models.RoleAdmin,
	"edit_areas":   models.RoleEditor,
	"checkout":     models.RoleMember,
	"visit":        models.RoleMember,
}

type authService struct {
	userRepo domain.UserRepository
}

// NewAuthService はAuthServiceの実装を生成する。
func NewAuthService(userRepo domain.UserRepository) AuthService {
	return &authService{userRepo: userRepo}
}

func (s *authService) CanPerform(actor models.Role, action string) bool {
	minRole, ok := actionMinRole[action]
	if !ok {
		return false
	}
	return actor.IsAtLeast(minRole)
}

func (s *authService) InviteToRole(actorID string, targetID string, newRole models.Role) (*models.Invitation, error) {
	actor, err := s.userRepo.GetUser(actorID)
	if err != nil {
		return nil, Errorf(ErrNotFound, "actor not found: %s", actorID)
	}
	if !actor.Role.IsAtLeast(models.RoleEditor) {
		return nil, NewError(ErrPermissionDenied, "invite requires editor or above")
	}

	now := time.Now()
	inv := &models.Invitation{
		ID:         fmt.Sprintf("inv-%d", now.UnixNano()),
		Type:       models.InvitationTypeRolePromote,
		Status:     models.InvitationStatusPending,
		InviterID:  actorID,
		InviteeID:  targetID,
		TargetRole: newRole,
		CreatedAt:  now,
	}

	if err := s.userRepo.SaveInvitation(inv); err != nil {
		return nil, fmt.Errorf("save invitation: %w", err)
	}
	return inv, nil
}

func (s *authService) AcceptInvitation(actorID string, invitationID string) error {
	inv, err := s.userRepo.GetInvitation(invitationID)
	if err != nil {
		return Errorf(ErrNotFound, "invitation not found: %s", invitationID)
	}

	if inv.InviteeID != actorID {
		return NewError(ErrPermissionDenied, "only the invitee can accept")
	}

	if inv.Status != models.InvitationStatusPending {
		return Errorf(ErrInvalidState, "invitation is not pending (status: %s)", inv.Status)
	}

	// ロール変更
	user, err := s.userRepo.GetUser(actorID)
	if err != nil {
		return Errorf(ErrNotFound, "user not found: %s", actorID)
	}
	user.Role = inv.TargetRole
	if err := s.userRepo.SaveUser(user); err != nil {
		return fmt.Errorf("save user: %w", err)
	}

	// 招待ステータス更新
	now := time.Now()
	inv.Status = models.InvitationStatusAccepted
	inv.ResolvedAt = &now
	return s.userRepo.SaveInvitation(inv)
}

func (s *authService) DismissRole(actorID string, targetID string, newRole models.Role) error {
	// 自己罷免チェック
	if actorID == targetID {
		return NewError(ErrSelfDismissal, "cannot dismiss yourself")
	}

	actor, err := s.userRepo.GetUser(actorID)
	if err != nil {
		return Errorf(ErrNotFound, "actor not found: %s", actorID)
	}
	if !actor.Role.IsAtLeast(models.RoleAdmin) {
		return NewError(ErrPermissionDenied, "dismiss requires admin")
	}

	target, err := s.userRepo.GetUser(targetID)
	if err != nil {
		return Errorf(ErrNotFound, "target not found: %s", targetID)
	}

	// 最後の管理者チェック
	if target.Role == models.RoleAdmin {
		users, _ := s.userRepo.ListUsers()
		adminCount := 0
		for _, u := range users {
			if u.Role == models.RoleAdmin {
				adminCount++
			}
		}
		if adminCount <= 1 {
			return NewError(ErrLastAdmin, "cannot dismiss the last admin")
		}
	}

	target.Role = newRole
	return s.userRepo.SaveUser(target)
}

func (s *authService) RemoveMember(actorID string, targetID string) error {
	actor, err := s.userRepo.GetUser(actorID)
	if err != nil {
		return Errorf(ErrNotFound, "actor not found: %s", actorID)
	}
	if actor.Role != models.RoleAdmin {
		return NewError(ErrPermissionDenied, "remove member requires admin")
	}

	return s.userRepo.DeleteUser(targetID)
}
