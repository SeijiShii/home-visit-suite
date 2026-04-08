package service

import (
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"time"

	"github.com/SeijiShii/home-visit-suite/shared/domain"
	"github.com/SeijiShii/home-visit-suite/shared/domain/models"
)

type schedulePeriodService struct {
	repo             domain.CoverageRepository
	userRepo         domain.UserRepository
	notificationRepo domain.NotificationRepository
	regionRepo       domain.RegionRepository
}

// NewSchedulePeriodService は SchedulePeriodService の実装を生成する。
// userRepo / notificationRepo / regionRepo は nil 可能だが、Approve や
// AreaAvailability の AreaID 検証など一部機能はそれらが必要となる。
func NewSchedulePeriodService(
	repo domain.CoverageRepository,
	userRepo domain.UserRepository,
	notificationRepo domain.NotificationRepository,
	regionRepo domain.RegionRepository,
) SchedulePeriodService {
	return &schedulePeriodService{
		repo:             repo,
		userRepo:         userRepo,
		notificationRepo: notificationRepo,
		regionRepo:       regionRepo,
	}
}

// =============================================================================
// SchedulePeriod
// =============================================================================

func (s *schedulePeriodService) CreateSchedulePeriod(sp *models.SchedulePeriod) error {
	if err := validatePeriodDates(sp.StartDate, sp.EndDate); err != nil {
		return err
	}

	existing, err := s.repo.ListSchedulePeriods()
	if err != nil {
		return fmt.Errorf("list schedule periods: %w", err)
	}

	for _, ex := range existing {
		if periodsOverlap(sp.StartDate, sp.EndDate, ex.StartDate, ex.EndDate) {
			return Errorf(ErrInvalidInput, "period [%s, %s] overlaps with existing period %q [%s, %s]",
				sp.StartDate.Format("2006-01-02"),
				sp.EndDate.Format("2006-01-02"),
				ex.ID,
				ex.StartDate.Format("2006-01-02"),
				ex.EndDate.Format("2006-01-02"),
			)
		}
	}

	now := time.Now()
	if sp.CreatedAt.IsZero() {
		sp.CreatedAt = now
	}
	sp.UpdatedAt = now

	return s.repo.SaveSchedulePeriod(sp)
}

func (s *schedulePeriodService) UpdateSchedulePeriod(sp *models.SchedulePeriod) error {
	if err := validatePeriodDates(sp.StartDate, sp.EndDate); err != nil {
		return err
	}

	existing, err := s.repo.ListSchedulePeriods()
	if err != nil {
		return fmt.Errorf("list schedule periods: %w", err)
	}

	for _, ex := range existing {
		if ex.ID == sp.ID {
			continue
		}
		if periodsOverlap(sp.StartDate, sp.EndDate, ex.StartDate, ex.EndDate) {
			return Errorf(ErrInvalidInput, "period [%s, %s] overlaps with existing period %q [%s, %s]",
				sp.StartDate.Format("2006-01-02"),
				sp.EndDate.Format("2006-01-02"),
				ex.ID,
				ex.StartDate.Format("2006-01-02"),
				ex.EndDate.Format("2006-01-02"),
			)
		}
	}

	sp.UpdatedAt = time.Now()
	return s.repo.SaveSchedulePeriod(sp)
}

func (s *schedulePeriodService) DeleteSchedulePeriod(id string) error {
	if _, err := s.repo.GetSchedulePeriod(id); err != nil {
		return Errorf(ErrNotFound, "schedule period not found: %s", id)
	}
	return s.repo.DeleteSchedulePeriod(id)
}

func (s *schedulePeriodService) ListSchedulePeriods() ([]models.SchedulePeriod, error) {
	return s.repo.ListSchedulePeriods()
}

func (s *schedulePeriodService) GetSchedulePeriod(id string) (*models.SchedulePeriod, error) {
	sp, err := s.repo.GetSchedulePeriod(id)
	if err != nil {
		return nil, Errorf(ErrNotFound, "schedule period not found: %s", id)
	}
	return sp, nil
}

// ApproveSchedulePeriod は予定期間の承認状態を true に切り替え、監査ログを残す。
func (s *schedulePeriodService) ApproveSchedulePeriod(actorID, id string) error {
	return s.setApproval(actorID, id, true, "approve")
}

// RevokeSchedulePeriodApproval は予定期間の承認を取り消す。
func (s *schedulePeriodService) RevokeSchedulePeriodApproval(actorID, id string) error {
	return s.setApproval(actorID, id, false, "revoke")
}

func (s *schedulePeriodService) setApproval(actorID, id string, approved bool, detail string) error {
	if err := s.requireAdmin(actorID); err != nil {
		return err
	}

	sp, err := s.repo.GetSchedulePeriod(id)
	if err != nil {
		return Errorf(ErrNotFound, "schedule period not found: %s", id)
	}

	sp.Approved = approved
	sp.UpdatedAt = time.Now()
	if err := s.repo.SaveSchedulePeriod(sp); err != nil {
		return err
	}

	if s.notificationRepo != nil {
		_ = s.notificationRepo.SaveAuditLog(&models.AuditLog{
			ID:        newID("al"),
			Action:    models.AuditActionApproval,
			ActorID:   actorID,
			TargetID:  id,
			Detail:    "schedule_period:" + detail,
			Timestamp: time.Now(),
			CreatedAt: time.Now(),
		})
	}
	return nil
}

func (s *schedulePeriodService) requireAdmin(actorID string) error {
	if s.userRepo == nil {
		return Errorf(ErrPermissionDenied, "user repository not configured")
	}
	user, err := s.userRepo.GetUser(actorID)
	if err != nil {
		return Errorf(ErrNotFound, "actor not found: %s", actorID)
	}
	if !user.Role.IsAtLeast(models.RoleAdmin) {
		return Errorf(ErrPermissionDenied, "admin role required")
	}
	return nil
}

// =============================================================================
// Scope
// =============================================================================

func (s *schedulePeriodService) CreateScope(sc *models.Scope) error {
	if _, err := s.repo.GetSchedulePeriod(sc.SchedulePeriodID); err != nil {
		return Errorf(ErrNotFound, "schedule period not found: %s", sc.SchedulePeriodID)
	}

	if err := s.checkParentAreaExclusivity(sc.SchedulePeriodID, "", sc.ParentAreaIDs); err != nil {
		return err
	}

	now := time.Now()
	if sc.CreatedAt.IsZero() {
		sc.CreatedAt = now
	}
	sc.UpdatedAt = now

	return s.repo.SaveScope(sc)
}

func (s *schedulePeriodService) UpdateScope(sc *models.Scope) error {
	if err := s.checkParentAreaExclusivity(sc.SchedulePeriodID, sc.ID, sc.ParentAreaIDs); err != nil {
		return err
	}

	sc.UpdatedAt = time.Now()
	return s.repo.SaveScope(sc)
}

func (s *schedulePeriodService) DeleteScope(id string) error {
	if _, err := s.repo.GetScope(id); err != nil {
		return Errorf(ErrNotFound, "scope not found: %s", id)
	}
	return s.repo.DeleteScope(id)
}

func (s *schedulePeriodService) ListScopes(schedulePeriodID string) ([]models.Scope, error) {
	return s.repo.ListScopes(schedulePeriodID)
}

func (s *schedulePeriodService) GetScope(id string) (*models.Scope, error) {
	sc, err := s.repo.GetScope(id)
	if err != nil {
		return nil, Errorf(ErrNotFound, "scope not found: %s", id)
	}
	return sc, nil
}

// CreateScopesFromGroups は指定されたメンバーグループ ID から、それぞれ 1:1 で
// スコープを生成する。グループ名がスコープ名となり、ParentAreaIDs は空。
func (s *schedulePeriodService) CreateScopesFromGroups(schedulePeriodID string, groupIDs []string) ([]models.Scope, error) {
	if s.userRepo == nil {
		return nil, Errorf(ErrInvalidState, "user repository not configured")
	}
	if _, err := s.repo.GetSchedulePeriod(schedulePeriodID); err != nil {
		return nil, Errorf(ErrNotFound, "schedule period not found: %s", schedulePeriodID)
	}

	// 同一期間内の既存スコープが同じ groupId を持っていないか確認
	existingScopes, err := s.repo.ListScopes(schedulePeriodID)
	if err != nil {
		return nil, fmt.Errorf("list scopes: %w", err)
	}
	usedGroup := make(map[string]struct{}, len(existingScopes))
	for _, ex := range existingScopes {
		if ex.GroupID != "" {
			usedGroup[ex.GroupID] = struct{}{}
		}
	}

	created := make([]models.Scope, 0, len(groupIDs))
	for _, gid := range groupIDs {
		group, err := s.userRepo.GetGroup(gid)
		if err != nil {
			return nil, Errorf(ErrNotFound, "group not found: %s", gid)
		}
		if _, dup := usedGroup[gid]; dup {
			return nil, Errorf(ErrAlreadyExists, "group %q already has a scope in this period", gid)
		}

		now := time.Now()
		sc := &models.Scope{
			ID:               newID("scope"),
			SchedulePeriodID: schedulePeriodID,
			Name:             group.Name,
			GroupID:          group.ID,
			ParentAreaIDs:    []string{},
			CreatedAt:        now,
			UpdatedAt:        now,
		}
		if err := s.repo.SaveScope(sc); err != nil {
			return nil, err
		}
		usedGroup[gid] = struct{}{}
		created = append(created, *sc)
	}
	return created, nil
}

// =============================================================================
// AreaAvailability
// =============================================================================

func (s *schedulePeriodService) CreateAreaAvailability(aa *models.AreaAvailability) error {
	if err := s.validateAreaAvailability(aa); err != nil {
		return err
	}
	if aa.CreatedAt.IsZero() {
		aa.CreatedAt = time.Now()
	}
	return s.repo.SaveAreaAvailability(aa)
}

func (s *schedulePeriodService) UpdateAreaAvailability(aa *models.AreaAvailability) error {
	if err := s.validateAreaAvailability(aa); err != nil {
		return err
	}
	return s.repo.SaveAreaAvailability(aa)
}

func (s *schedulePeriodService) DeleteAreaAvailability(id string) error {
	return s.repo.DeleteAreaAvailability(id)
}

func (s *schedulePeriodService) ListAreaAvailabilities(scopeID string) ([]models.AreaAvailability, error) {
	return s.repo.ListAreaAvailabilities(scopeID)
}

func (s *schedulePeriodService) validateAreaAvailability(aa *models.AreaAvailability) error {
	if aa.Type != models.AvailabilityLendable && aa.Type != models.AvailabilitySelfTake {
		return Errorf(ErrInvalidInput, "invalid availability type: %q", aa.Type)
	}

	scope, err := s.repo.GetScope(aa.ScopeID)
	if err != nil {
		return Errorf(ErrNotFound, "scope not found: %s", aa.ScopeID)
	}

	// AreaID は区域親番 ID として扱い、Scope.ParentAreaIDs に含まれること
	for _, paID := range scope.ParentAreaIDs {
		if paID == aa.AreaID {
			return nil
		}
	}
	return Errorf(ErrInvalidInput,
		"parent area %q is not in scope %q",
		aa.AreaID, scope.ID,
	)
}

// =============================================================================
// helpers
// =============================================================================

func validatePeriodDates(start, end time.Time) error {
	if !start.Before(end) {
		return Errorf(ErrInvalidInput, "start date %s must be before end date %s",
			start.Format("2006-01-02"),
			end.Format("2006-01-02"),
		)
	}
	return nil
}

func periodsOverlap(s1, e1, s2, e2 time.Time) bool {
	return s1.Before(e2) && s2.Before(e1)
}

func (s *schedulePeriodService) checkParentAreaExclusivity(schedulePeriodID, excludeScopeID string, candidateIDs []string) error {
	if len(candidateIDs) == 0 {
		return nil
	}

	scopes, err := s.repo.ListScopes(schedulePeriodID)
	if err != nil {
		return fmt.Errorf("list scopes: %w", err)
	}

	candidateSet := make(map[string]struct{}, len(candidateIDs))
	for _, id := range candidateIDs {
		candidateSet[id] = struct{}{}
	}

	for _, ex := range scopes {
		if ex.ID == excludeScopeID {
			continue
		}
		for _, paID := range ex.ParentAreaIDs {
			if _, dup := candidateSet[paID]; dup {
				return Errorf(ErrInvalidInput,
					"parent area %q is already assigned to scope %q in schedule period %q",
					paID, ex.ID, schedulePeriodID,
				)
			}
		}
	}
	return nil
}

// newID はランダム ID を生成する。
func newID(prefix string) string {
	b := make([]byte, 8)
	_, _ = rand.Read(b)
	return prefix + "-" + hex.EncodeToString(b)
}
