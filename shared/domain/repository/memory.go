// Package repository はRegionRepositoryの各種実装を提供する。
package repository

import (
	"fmt"
	"sync"
	"time"

	"github.com/SeijiShii/home-visit-suite/shared/domain/models"
)

// InMemoryRepository はテスト・開発用のインメモリ実装。
type InMemoryRepository struct {
	mu          sync.RWMutex
	regions     map[string]*models.Region
	parentAreas map[string]*models.ParentArea
	areas       map[string]*models.Area
}

// NewInMemoryRepository は空のInMemoryRepositoryを生成する。
func NewInMemoryRepository() *InMemoryRepository {
	return &InMemoryRepository{
		regions:     make(map[string]*models.Region),
		parentAreas: make(map[string]*models.ParentArea),
		areas:       make(map[string]*models.Area),
	}
}

// --- Region ---

func (r *InMemoryRepository) ListRegions() ([]models.Region, error) {
	r.mu.RLock()
	defer r.mu.RUnlock()

	result := make([]models.Region, 0, len(r.regions))
	for _, v := range r.regions {
		if v.DeletedAt == nil {
			result = append(result, *v)
		}
	}
	return result, nil
}

func (r *InMemoryRepository) GetRegion(id string) (*models.Region, error) {
	r.mu.RLock()
	defer r.mu.RUnlock()

	v, ok := r.regions[id]
	if !ok || v.DeletedAt != nil {
		return nil, fmt.Errorf("region not found: %s", id)
	}
	copy := *v
	return &copy, nil
}

func (r *InMemoryRepository) GetRegionRaw(id string) (*models.Region, error) {
	r.mu.RLock()
	defer r.mu.RUnlock()

	v, ok := r.regions[id]
	if !ok {
		return nil, fmt.Errorf("region not found: %s", id)
	}
	copy := *v
	return &copy, nil
}

func (r *InMemoryRepository) SaveRegion(region *models.Region) error {
	r.mu.Lock()
	defer r.mu.Unlock()

	copy := *region
	r.regions[region.ID] = &copy
	return nil
}

func (r *InMemoryRepository) DeleteRegion(id string) error {
	r.mu.Lock()
	defer r.mu.Unlock()

	v, ok := r.regions[id]
	if !ok || v.DeletedAt != nil {
		return fmt.Errorf("region not found: %s", id)
	}
	now := time.Now()
	v.DeletedAt = &now
	return nil
}

// --- ParentArea ---

func (r *InMemoryRepository) ListParentAreas(regionID string) ([]models.ParentArea, error) {
	r.mu.RLock()
	defer r.mu.RUnlock()

	var result []models.ParentArea
	for _, v := range r.parentAreas {
		if v.RegionID == regionID && v.DeletedAt == nil {
			result = append(result, *v)
		}
	}
	return result, nil
}

func (r *InMemoryRepository) GetParentArea(id string) (*models.ParentArea, error) {
	r.mu.RLock()
	defer r.mu.RUnlock()

	v, ok := r.parentAreas[id]
	if !ok || v.DeletedAt != nil {
		return nil, fmt.Errorf("parent area not found: %s", id)
	}
	copy := *v
	return &copy, nil
}

func (r *InMemoryRepository) GetParentAreaRaw(id string) (*models.ParentArea, error) {
	r.mu.RLock()
	defer r.mu.RUnlock()

	v, ok := r.parentAreas[id]
	if !ok {
		return nil, fmt.Errorf("parent area not found: %s", id)
	}
	copy := *v
	return &copy, nil
}

func (r *InMemoryRepository) SaveParentArea(pa *models.ParentArea) error {
	r.mu.Lock()
	defer r.mu.Unlock()

	copy := *pa
	r.parentAreas[pa.ID] = &copy
	return nil
}

func (r *InMemoryRepository) DeleteParentArea(id string) error {
	r.mu.Lock()
	defer r.mu.Unlock()

	v, ok := r.parentAreas[id]
	if !ok || v.DeletedAt != nil {
		return fmt.Errorf("parent area not found: %s", id)
	}
	now := time.Now()
	v.DeletedAt = &now
	return nil
}

// --- Area ---

func (r *InMemoryRepository) ListAreas(parentAreaID string) ([]models.Area, error) {
	r.mu.RLock()
	defer r.mu.RUnlock()

	var result []models.Area
	for _, v := range r.areas {
		if v.ParentAreaID == parentAreaID && v.DeletedAt == nil {
			result = append(result, *v)
		}
	}
	return result, nil
}

func (r *InMemoryRepository) GetArea(id string) (*models.Area, error) {
	r.mu.RLock()
	defer r.mu.RUnlock()

	v, ok := r.areas[id]
	if !ok || v.DeletedAt != nil {
		return nil, fmt.Errorf("area not found: %s", id)
	}
	copy := *v
	return &copy, nil
}

func (r *InMemoryRepository) GetAreaRaw(id string) (*models.Area, error) {
	r.mu.RLock()
	defer r.mu.RUnlock()

	v, ok := r.areas[id]
	if !ok {
		return nil, fmt.Errorf("area not found: %s", id)
	}
	copy := *v
	return &copy, nil
}

func (r *InMemoryRepository) SaveArea(area *models.Area) error {
	r.mu.Lock()
	defer r.mu.Unlock()

	copy := *area
	r.areas[area.ID] = &copy
	return nil
}

func (r *InMemoryRepository) DeleteArea(id string) error {
	r.mu.Lock()
	defer r.mu.Unlock()

	v, ok := r.areas[id]
	if !ok || v.DeletedAt != nil {
		return fmt.Errorf("area not found: %s", id)
	}
	now := time.Now()
	v.DeletedAt = &now
	return nil
}
