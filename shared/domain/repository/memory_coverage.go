package repository

import (
	"fmt"
	"sync"
	"time"

	"github.com/SeijiShii/home-visit-suite/shared/domain/models"
)

type InMemoryCoverageRepository struct {
	mu                  sync.RWMutex
	coverages           map[string]*models.Coverage
	availablePeriods    map[string]*models.AvailablePeriod
	availablePeriodTags map[string]*models.AvailablePeriodTag
}

func NewInMemoryCoverageRepository() *InMemoryCoverageRepository {
	return &InMemoryCoverageRepository{
		coverages:           make(map[string]*models.Coverage),
		availablePeriods:    make(map[string]*models.AvailablePeriod),
		availablePeriodTags: make(map[string]*models.AvailablePeriodTag),
	}
}

// --- Coverage ---

func (r *InMemoryCoverageRepository) ListCoverages(parentAreaID string) ([]models.Coverage, error) {
	r.mu.RLock()
	defer r.mu.RUnlock()

	var result []models.Coverage
	for _, v := range r.coverages {
		if v.ParentAreaID == parentAreaID {
			result = append(result, *v)
		}
	}
	return result, nil
}

func (r *InMemoryCoverageRepository) GetCoverage(id string) (*models.Coverage, error) {
	r.mu.RLock()
	defer r.mu.RUnlock()

	v, ok := r.coverages[id]
	if !ok {
		return nil, fmt.Errorf("coverage not found: %s", id)
	}
	copy := *v
	return &copy, nil
}

func (r *InMemoryCoverageRepository) SaveCoverage(c *models.Coverage) error {
	r.mu.Lock()
	defer r.mu.Unlock()

	copy := *c
	r.coverages[c.ID] = &copy
	return nil
}

func (r *InMemoryCoverageRepository) DeleteCoverage(id string) error {
	r.mu.Lock()
	defer r.mu.Unlock()

	if _, ok := r.coverages[id]; !ok {
		return fmt.Errorf("coverage not found: %s", id)
	}
	delete(r.coverages, id)
	return nil
}

// --- AvailablePeriod ---

// deepCopyAvailablePeriod はスライスフィールドを含む AvailablePeriod のディープコピーを返す。
func deepCopyAvailablePeriod(v *models.AvailablePeriod) models.AvailablePeriod {
	copied := *v
	if v.ParentAreaIDs != nil {
		ids := make([]string, len(v.ParentAreaIDs))
		copy(ids, v.ParentAreaIDs)
		copied.ParentAreaIDs = ids
	}
	if v.TagIDs != nil {
		ids := make([]string, len(v.TagIDs))
		copy(ids, v.TagIDs)
		copied.TagIDs = ids
	}
	return copied
}

func (r *InMemoryCoverageRepository) ListAvailablePeriods() ([]models.AvailablePeriod, error) {
	r.mu.RLock()
	defer r.mu.RUnlock()

	var result []models.AvailablePeriod
	for _, v := range r.availablePeriods {
		result = append(result, deepCopyAvailablePeriod(v))
	}
	return result, nil
}

func (r *InMemoryCoverageRepository) GetAvailablePeriod(id string) (*models.AvailablePeriod, error) {
	r.mu.RLock()
	defer r.mu.RUnlock()

	v, ok := r.availablePeriods[id]
	if !ok {
		return nil, fmt.Errorf("available period not found: %s", id)
	}
	copied := deepCopyAvailablePeriod(v)
	return &copied, nil
}

// GetActiveAvailablePeriod は now 時点でアクティブな（startDate <= now <= endDate）AvailablePeriod を返す。
// 重複不可制約により、アクティブな期間は最大1つ。存在しなければ (nil, nil) を返す。
func (r *InMemoryCoverageRepository) GetActiveAvailablePeriod(now time.Time) (*models.AvailablePeriod, error) {
	r.mu.RLock()
	defer r.mu.RUnlock()

	for _, v := range r.availablePeriods {
		if v.IsActive(now) {
			copied := deepCopyAvailablePeriod(v)
			return &copied, nil
		}
	}
	return nil, nil
}

func (r *InMemoryCoverageRepository) SaveAvailablePeriod(p *models.AvailablePeriod) error {
	r.mu.Lock()
	defer r.mu.Unlock()

	copied := deepCopyAvailablePeriod(p)
	r.availablePeriods[p.ID] = &copied
	return nil
}

func (r *InMemoryCoverageRepository) DeleteAvailablePeriod(id string) error {
	r.mu.Lock()
	defer r.mu.Unlock()

	if _, ok := r.availablePeriods[id]; !ok {
		return fmt.Errorf("available period not found: %s", id)
	}
	delete(r.availablePeriods, id)
	return nil
}

// --- AvailablePeriodTag ---

func (r *InMemoryCoverageRepository) ListAvailablePeriodTags() ([]models.AvailablePeriodTag, error) {
	r.mu.RLock()
	defer r.mu.RUnlock()

	var result []models.AvailablePeriodTag
	for _, v := range r.availablePeriodTags {
		result = append(result, *v)
	}
	return result, nil
}

func (r *InMemoryCoverageRepository) GetAvailablePeriodTag(id string) (*models.AvailablePeriodTag, error) {
	r.mu.RLock()
	defer r.mu.RUnlock()

	v, ok := r.availablePeriodTags[id]
	if !ok {
		return nil, fmt.Errorf("available period tag not found: %s", id)
	}
	copied := *v
	return &copied, nil
}

func (r *InMemoryCoverageRepository) SaveAvailablePeriodTag(t *models.AvailablePeriodTag) error {
	r.mu.Lock()
	defer r.mu.Unlock()

	copied := *t
	r.availablePeriodTags[t.ID] = &copied
	return nil
}

func (r *InMemoryCoverageRepository) DeleteAvailablePeriodTag(id string) error {
	r.mu.Lock()
	defer r.mu.Unlock()

	if _, ok := r.availablePeriodTags[id]; !ok {
		return fmt.Errorf("available period tag not found: %s", id)
	}
	delete(r.availablePeriodTags, id)
	return nil
}
