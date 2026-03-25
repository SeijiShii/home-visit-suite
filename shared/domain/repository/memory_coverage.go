package repository

import (
	"fmt"
	"sync"

	"github.com/SeijiShii/home-visit-suite/shared/domain/models"
)

type InMemoryCoverageRepository struct {
	mu             sync.RWMutex
	coverages      map[string]*models.Coverage
	plans          map[string]*models.CoveragePlan
	availabilities map[string]*models.AreaAvailability
}

func NewInMemoryCoverageRepository() *InMemoryCoverageRepository {
	return &InMemoryCoverageRepository{
		coverages:      make(map[string]*models.Coverage),
		plans:          make(map[string]*models.CoveragePlan),
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

// --- CoveragePlan ---

func (r *InMemoryCoverageRepository) ListCoveragePlans(coverageID string) ([]models.CoveragePlan, error) {
	r.mu.RLock()
	defer r.mu.RUnlock()

	var result []models.CoveragePlan
	for _, v := range r.plans {
		if v.CoverageID == coverageID {
			result = append(result, *v)
		}
	}
	return result, nil
}

func (r *InMemoryCoverageRepository) GetCoveragePlan(id string) (*models.CoveragePlan, error) {
	r.mu.RLock()
	defer r.mu.RUnlock()

	v, ok := r.plans[id]
	if !ok {
		return nil, fmt.Errorf("coverage plan not found: %s", id)
	}
	copy := *v
	return &copy, nil
}

func (r *InMemoryCoverageRepository) SaveCoveragePlan(cp *models.CoveragePlan) error {
	r.mu.Lock()
	defer r.mu.Unlock()

	copy := *cp
	r.plans[cp.ID] = &copy
	return nil
}

func (r *InMemoryCoverageRepository) DeleteCoveragePlan(id string) error {
	r.mu.Lock()
	defer r.mu.Unlock()

	if _, ok := r.plans[id]; !ok {
		return fmt.Errorf("coverage plan not found: %s", id)
	}
	delete(r.plans, id)
	return nil
}

// --- AreaAvailability ---

func (r *InMemoryCoverageRepository) ListAreaAvailabilities(coveragePlanID string) ([]models.AreaAvailability, error) {
	r.mu.RLock()
	defer r.mu.RUnlock()

	var result []models.AreaAvailability
	for _, v := range r.availabilities {
		if v.CoveragePlanID == coveragePlanID {
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
