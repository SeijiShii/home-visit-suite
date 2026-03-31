package service

import (
	"fmt"
	"time"

	"github.com/SeijiShii/home-visit-suite/shared/domain"
	"github.com/SeijiShii/home-visit-suite/shared/domain/models"
)

type schedulePeriodService struct {
	repo domain.CoverageRepository
}

// NewSchedulePeriodService は SchedulePeriodService の実装を生成する。
func NewSchedulePeriodService(repo domain.CoverageRepository) SchedulePeriodService {
	return &schedulePeriodService{repo: repo}
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
		// 自分自身はスキップ
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

// =============================================================================
// Scope
// =============================================================================

func (s *schedulePeriodService) CreateScope(sc *models.Scope) error {
	// 親期間の存在確認
	if _, err := s.repo.GetSchedulePeriod(sc.SchedulePeriodID); err != nil {
		return Errorf(ErrNotFound, "schedule period not found: %s", sc.SchedulePeriodID)
	}

	// ParentAreaID の排他チェック（同一 SchedulePeriod 内）
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
	// ParentAreaID の排他チェック（自分以外の同一 SchedulePeriod 内スコープと比較）
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

// =============================================================================
// helpers
// =============================================================================

// validatePeriodDates は StartDate < EndDate であることを検証する。
func validatePeriodDates(start, end time.Time) error {
	if !start.Before(end) {
		return Errorf(ErrInvalidInput, "start date %s must be before end date %s",
			start.Format("2006-01-02"),
			end.Format("2006-01-02"),
		)
	}
	return nil
}

// periodsOverlap は二つの期間 [s1,e1) と [s2,e2) が重複するかを返す。
// 隣接（e1==s2 または e2==s1）は重複しないものとして扱う。
func periodsOverlap(s1, e1, s2, e2 time.Time) bool {
	// s1 < e2 かつ s2 < e1 のとき重複
	return s1.Before(e2) && s2.Before(e1)
}

// checkParentAreaExclusivity は、candidateIDs が同一 SchedulePeriod 内の
// 他スコープ（excludeScopeID を除く）で既に使われていないことを確認する。
// excludeScopeID が空文字の場合はすべての既存スコープを比較対象にする。
func (s *schedulePeriodService) checkParentAreaExclusivity(schedulePeriodID, excludeScopeID string, candidateIDs []string) error {
	if len(candidateIDs) == 0 {
		return nil
	}

	scopes, err := s.repo.ListScopes(schedulePeriodID)
	if err != nil {
		return fmt.Errorf("list scopes: %w", err)
	}

	// 候補 ID をセットに変換
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
