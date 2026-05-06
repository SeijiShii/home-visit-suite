package service

import (
	"fmt"
	"time"

	"github.com/SeijiShii/home-visit-suite/shared/domain"
	"github.com/SeijiShii/home-visit-suite/shared/domain/models"
)

type availablePeriodService struct {
	covRepo  domain.CoverageRepository
	coRepo   domain.CheckoutRepository
	userRepo domain.UserRepository
}

// NewAvailablePeriodService は AvailablePeriodService の実装を返す。
func NewAvailablePeriodService(
	covRepo domain.CoverageRepository,
	coRepo domain.CheckoutRepository,
	userRepo domain.UserRepository,
) AvailablePeriodService {
	return &availablePeriodService{covRepo: covRepo, coRepo: coRepo, userRepo: userRepo}
}

func (s *availablePeriodService) requireEditor(actorID string) error {
	user, err := s.userRepo.GetUser(actorID)
	if err != nil {
		return Errorf(ErrNotFound, "user not found: %s", actorID)
	}
	if !user.Role.IsAtLeast(models.RoleEditor) {
		return NewError(ErrPermissionDenied, "available period operation requires editor or above")
	}
	return nil
}

// --- Period CRUD ---

func (s *availablePeriodService) CreatePeriod(actorID, name string, startDate, endDate time.Time, parentAreaIDs, tagIDs []string) (*models.AvailablePeriod, error) {
	if err := s.requireEditor(actorID); err != nil {
		return nil, err
	}

	now := time.Now()
	p := &models.AvailablePeriod{
		ID:            fmt.Sprintf("ap-%d", now.UnixNano()),
		Name:          name,
		StartDate:     startDate,
		EndDate:       endDate,
		ParentAreaIDs: parentAreaIDs,
		TagIDs:        tagIDs,
		CreatedAt:     now,
		UpdatedAt:     now,
	}
	if err := p.Validate(); err != nil {
		return nil, Errorf(ErrInvalidInput, "validate: %v", err)
	}

	// 重複チェック
	all, err := s.covRepo.ListAvailablePeriods()
	if err != nil {
		return nil, fmt.Errorf("list periods: %w", err)
	}
	for _, other := range all {
		if p.Overlaps(other) {
			return nil, Errorf(ErrInvalidInput, "period overlaps existing %q", other.Name)
		}
	}

	if err := s.covRepo.SaveAvailablePeriod(p); err != nil {
		return nil, fmt.Errorf("save period: %w", err)
	}
	return p, nil
}

func (s *availablePeriodService) UpdatePeriod(actorID, periodID string, update PeriodUpdate) (*models.AvailablePeriod, error) {
	if err := s.requireEditor(actorID); err != nil {
		return nil, err
	}

	current, err := s.covRepo.GetAvailablePeriod(periodID)
	if err != nil {
		return nil, Errorf(ErrNotFound, "period not found: %s", periodID)
	}

	now := time.Now()
	phase := current.Phase(now)

	// 段階的ロックの判定
	switch phase {
	case models.AvailablePeriodPhasePending:
		// 全項目編集可
	case models.AvailablePeriodPhaseActive:
		if update.Name != nil {
			return nil, Errorf(ErrInvalidState, "cannot rename active period")
		}
		if update.StartDate != nil {
			return nil, Errorf(ErrInvalidState, "cannot change startDate of active period")
		}
		if update.EndDate != nil && update.EndDate.Before(current.EndDate) {
			return nil, Errorf(ErrInvalidState, "cannot shorten endDate of active period")
		}
		if update.ParentAreaIDs != nil {
			// 削除されていないか確認（追加のみ許容）
			if !isSubset(current.ParentAreaIDs, *update.ParentAreaIDs) {
				return nil, Errorf(ErrInvalidState, "cannot remove parent areas from active period")
			}
		}
	case models.AvailablePeriodPhaseClosed:
		if update.Name != nil || update.StartDate != nil || update.EndDate != nil || update.ParentAreaIDs != nil {
			return nil, Errorf(ErrInvalidState, "closed period: only tags are editable")
		}
	}

	// 適用
	if update.Name != nil {
		current.Name = *update.Name
	}
	if update.StartDate != nil {
		current.StartDate = *update.StartDate
	}
	if update.EndDate != nil {
		current.EndDate = *update.EndDate
	}
	if update.ParentAreaIDs != nil {
		current.ParentAreaIDs = *update.ParentAreaIDs
	}
	if update.TagIDs != nil {
		current.TagIDs = *update.TagIDs
	}

	if err := current.Validate(); err != nil {
		return nil, Errorf(ErrInvalidInput, "validate: %v", err)
	}

	// 重複チェック（自分自身を除く）
	all, err := s.covRepo.ListAvailablePeriods()
	if err != nil {
		return nil, fmt.Errorf("list periods: %w", err)
	}
	for _, other := range all {
		if other.ID == current.ID {
			continue
		}
		if current.Overlaps(other) {
			return nil, Errorf(ErrInvalidInput, "period overlaps existing %q", other.Name)
		}
	}

	current.UpdatedAt = now
	if err := s.covRepo.SaveAvailablePeriod(current); err != nil {
		return nil, fmt.Errorf("save period: %w", err)
	}
	return current, nil
}

func (s *availablePeriodService) DeletePeriod(actorID, periodID string) error {
	if err := s.requireEditor(actorID); err != nil {
		return err
	}

	current, err := s.covRepo.GetAvailablePeriod(periodID)
	if err != nil {
		return Errorf(ErrNotFound, "period not found: %s", periodID)
	}

	now := time.Now()
	if current.Phase(now) != models.AvailablePeriodPhasePending {
		return Errorf(ErrInvalidState, "can only delete pending periods")
	}

	return s.covRepo.DeleteAvailablePeriod(periodID)
}

func (s *availablePeriodService) ListPeriods() ([]models.AvailablePeriod, error) {
	return s.covRepo.ListAvailablePeriods()
}

func (s *availablePeriodService) GetPeriod(id string) (*models.AvailablePeriod, error) {
	p, err := s.covRepo.GetAvailablePeriod(id)
	if err != nil {
		return nil, Errorf(ErrNotFound, "period not found: %s", id)
	}
	return p, nil
}

func (s *availablePeriodService) GetActivePeriod(now time.Time) (*models.AvailablePeriod, error) {
	return s.covRepo.GetActiveAvailablePeriod(now)
}

// --- ForceCloseExpiredCheckouts ---

func (s *availablePeriodService) ForceCloseExpiredCheckouts(now time.Time) (int, error) {
	periods, err := s.covRepo.ListAvailablePeriods()
	if err != nil {
		return 0, fmt.Errorf("list periods: %w", err)
	}

	closed := 0
	for _, p := range periods {
		if p.Phase(now) != models.AvailablePeriodPhaseClosed {
			continue
		}
		// この期間配下の未完了チェックアウトを強制クローズ
		// 全チェックアウトを舐めて period に紐づくものを処理する（メモリ実装の都合）
		all, err := s.coRepo.ListAllCheckouts()
		if err != nil {
			return closed, fmt.Errorf("list checkouts: %w", err)
		}
		for _, c := range all {
			if c.AvailablePeriodID != p.ID {
				continue
			}
			if c.Status != models.CheckoutStatusPending && c.Status != models.CheckoutStatusActive {
				continue
			}
			c.Status = models.CheckoutStatusForceClosed
			closedAt := now
			c.ForceClosedAt = &closedAt
			c.UpdatedAt = now
			if err := s.coRepo.SaveCheckout(&c); err != nil {
				return closed, fmt.Errorf("save closed checkout: %w", err)
			}
			// 紐づく招待も連動失効
			invs, err := s.coRepo.ListCheckoutInvitations(c.ID)
			if err != nil {
				return closed, fmt.Errorf("list invitations: %w", err)
			}
			for i := range invs {
				inv := &invs[i]
				if inv.RevokedAt != nil {
					continue
				}
				inv.RevokedAt = &closedAt
				if err := s.coRepo.SaveCheckoutInvitation(inv); err != nil {
					return closed, fmt.Errorf("revoke invitation: %w", err)
				}
			}
			closed++
		}
	}
	return closed, nil
}

// --- Tag CRUD ---

func (s *availablePeriodService) CreateTag(actorID, name, color string) (*models.AvailablePeriodTag, error) {
	if err := s.requireEditor(actorID); err != nil {
		return nil, err
	}

	tag := &models.AvailablePeriodTag{
		ID:    fmt.Sprintf("apt-%d", time.Now().UnixNano()),
		Name:  name,
		Color: color,
	}
	if err := tag.Validate(); err != nil {
		return nil, Errorf(ErrInvalidInput, "validate: %v", err)
	}

	// 重複チェック
	existing, err := s.covRepo.ListAvailablePeriodTags()
	if err != nil {
		return nil, fmt.Errorf("list tags: %w", err)
	}
	for _, t := range existing {
		if t.Name == name {
			return nil, Errorf(ErrInvalidInput, "tag name %q already exists", name)
		}
	}

	if err := s.covRepo.SaveAvailablePeriodTag(tag); err != nil {
		return nil, fmt.Errorf("save tag: %w", err)
	}
	return tag, nil
}

func (s *availablePeriodService) UpdateTag(actorID, tagID, name, color string) (*models.AvailablePeriodTag, error) {
	if err := s.requireEditor(actorID); err != nil {
		return nil, err
	}

	current, err := s.covRepo.GetAvailablePeriodTag(tagID)
	if err != nil {
		return nil, Errorf(ErrNotFound, "tag not found: %s", tagID)
	}

	current.Name = name
	current.Color = color

	if err := current.Validate(); err != nil {
		return nil, Errorf(ErrInvalidInput, "validate: %v", err)
	}

	// 同名他タグがないか
	existing, err := s.covRepo.ListAvailablePeriodTags()
	if err != nil {
		return nil, fmt.Errorf("list tags: %w", err)
	}
	for _, t := range existing {
		if t.ID != tagID && t.Name == name {
			return nil, Errorf(ErrInvalidInput, "tag name %q already exists", name)
		}
	}

	if err := s.covRepo.SaveAvailablePeriodTag(current); err != nil {
		return nil, fmt.Errorf("save tag: %w", err)
	}
	return current, nil
}

func (s *availablePeriodService) DeleteTag(actorID, tagID string) error {
	if err := s.requireEditor(actorID); err != nil {
		return err
	}
	return s.covRepo.DeleteAvailablePeriodTag(tagID)
}

func (s *availablePeriodService) ListTags() ([]models.AvailablePeriodTag, error) {
	return s.covRepo.ListAvailablePeriodTags()
}

// --- helpers ---

// isSubset は a が b の部分集合か（b が a を全て含むか）を返す。
func isSubset(a, b []string) bool {
	set := make(map[string]struct{}, len(b))
	for _, v := range b {
		set[v] = struct{}{}
	}
	for _, v := range a {
		if _, ok := set[v]; !ok {
			return false
		}
	}
	return true
}
