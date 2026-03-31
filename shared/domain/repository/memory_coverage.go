package repository

import (
	"fmt"
	"sync"

	"github.com/SeijiShii/home-visit-suite/shared/domain/models"
)

type InMemoryCoverageRepository struct {
	mu              sync.RWMutex
	coverages       map[string]*models.Coverage
	periods         map[string]*models.SchedulePeriod
	scopes          map[string]*models.Scope
	availabilities  map[string]*models.AreaAvailability
}

func NewInMemoryCoverageRepository() *InMemoryCoverageRepository {
	return &InMemoryCoverageRepository{
		coverages:      make(map[string]*models.Coverage),
		periods:        make(map[string]*models.SchedulePeriod),
		scopes:         make(map[string]*models.Scope),
		availabilities: make(map[string]*models.AreaAvailability),
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

// --- SchedulePeriod ---

func (r *InMemoryCoverageRepository) ListSchedulePeriods() ([]models.SchedulePeriod, error) {
	r.mu.RLock()
	defer r.mu.RUnlock()

	var result []models.SchedulePeriod
	for _, v := range r.periods {
		result = append(result, *v)
	}
	return result, nil
}

func (r *InMemoryCoverageRepository) GetSchedulePeriod(id string) (*models.SchedulePeriod, error) {
	r.mu.RLock()
	defer r.mu.RUnlock()

	v, ok := r.periods[id]
	if !ok {
		return nil, fmt.Errorf("schedule period not found: %s", id)
	}
	copy := *v
	return &copy, nil
}

func (r *InMemoryCoverageRepository) SaveSchedulePeriod(sp *models.SchedulePeriod) error {
	r.mu.Lock()
	defer r.mu.Unlock()

	copy := *sp
	r.periods[sp.ID] = &copy
	return nil
}

func (r *InMemoryCoverageRepository) DeleteSchedulePeriod(id string) error {
	r.mu.Lock()
	defer r.mu.Unlock()

	if _, ok := r.periods[id]; !ok {
		return fmt.Errorf("schedule period not found: %s", id)
	}
	delete(r.periods, id)
	return nil
}

// --- Scope ---

func (r *InMemoryCoverageRepository) ListScopes(schedulePeriodID string) ([]models.Scope, error) {
	r.mu.RLock()
	defer r.mu.RUnlock()

	var result []models.Scope
	for _, v := range r.scopes {
		if v.SchedulePeriodID == schedulePeriodID {
			result = append(result, deepCopyScope(v))
		}
	}
	return result, nil
}

func (r *InMemoryCoverageRepository) ListAllScopes() ([]models.Scope, error) {
	r.mu.RLock()
	defer r.mu.RUnlock()

	var result []models.Scope
	for _, v := range r.scopes {
		result = append(result, deepCopyScope(v))
	}
	return result, nil
}

// deepCopyScope はスライスフィールドを含む Scope のディープコピーを返す。
func deepCopyScope(v *models.Scope) models.Scope {
	copied := *v
	if v.ParentAreaIDs != nil {
		ids := make([]string, len(v.ParentAreaIDs))
		copy(ids, v.ParentAreaIDs)
		copied.ParentAreaIDs = ids
	}
	return copied
}

func (r *InMemoryCoverageRepository) GetScope(id string) (*models.Scope, error) {
	r.mu.RLock()
	defer r.mu.RUnlock()

	v, ok := r.scopes[id]
	if !ok {
		return nil, fmt.Errorf("scope not found: %s", id)
	}
	copied := deepCopyScope(v)
	return &copied, nil
}

func (r *InMemoryCoverageRepository) SaveScope(sc *models.Scope) error {
	r.mu.Lock()
	defer r.mu.Unlock()

	copied := deepCopyScope(sc)
	r.scopes[sc.ID] = &copied
	return nil
}

func (r *InMemoryCoverageRepository) DeleteScope(id string) error {
	r.mu.Lock()
	defer r.mu.Unlock()

	if _, ok := r.scopes[id]; !ok {
		return fmt.Errorf("scope not found: %s", id)
	}
	delete(r.scopes, id)
	return nil
}

// --- AreaAvailability ---

func (r *InMemoryCoverageRepository) ListAreaAvailabilities(scopeID string) ([]models.AreaAvailability, error) {
	r.mu.RLock()
	defer r.mu.RUnlock()

	var result []models.AreaAvailability
	for _, v := range r.availabilities {
		if v.ScopeID == scopeID {
			result = append(result, *v)
		}
	}
	return result, nil
}

func (r *InMemoryCoverageRepository) SaveAreaAvailability(aa *models.AreaAvailability) error {
	r.mu.Lock()
	defer r.mu.Unlock()

	copy := *aa
	r.availabilities[aa.ID] = &copy
	return nil
}

func (r *InMemoryCoverageRepository) DeleteAreaAvailability(id string) error {
	r.mu.Lock()
	defer r.mu.Unlock()

	if _, ok := r.availabilities[id]; !ok {
		return fmt.Errorf("area availability not found: %s", id)
	}
	delete(r.availabilities, id)
	return nil
}
