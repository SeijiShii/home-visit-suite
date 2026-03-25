package repository

import (
	"fmt"
	"sort"
	"sync"

	"github.com/SeijiShii/home-visit-suite/shared/domain/models"
)

type InMemoryPlaceRepository struct {
	mu     sync.RWMutex
	places map[string]*models.Place
}

func NewInMemoryPlaceRepository() *InMemoryPlaceRepository {
	return &InMemoryPlaceRepository{places: make(map[string]*models.Place)}
}

func (r *InMemoryPlaceRepository) ListPlaces(areaID string) ([]models.Place, error) {
	r.mu.RLock()
	defer r.mu.RUnlock()

	var result []models.Place
	for _, v := range r.places {
		if v.AreaID == areaID {
			result = append(result, *v)
		}
	}
	sort.Slice(result, func(i, j int) bool {
		return result[i].SortOrder < result[j].SortOrder
	})
	return result, nil
}

func (r *InMemoryPlaceRepository) GetPlace(id string) (*models.Place, error) {
	r.mu.RLock()
	defer r.mu.RUnlock()

	v, ok := r.places[id]
	if !ok {
		return nil, fmt.Errorf("place not found: %s", id)
	}
	copy := *v
	return &copy, nil
}

func (r *InMemoryPlaceRepository) SavePlace(place *models.Place) error {
	r.mu.Lock()
	defer r.mu.Unlock()

	copy := *place
	r.places[place.ID] = &copy
	return nil
}

func (r *InMemoryPlaceRepository) DeletePlace(id string) error {
	r.mu.Lock()
	defer r.mu.Unlock()

	if _, ok := r.places[id]; !ok {
		return fmt.Errorf("place not found: %s", id)
	}
	delete(r.places, id)
	return nil
}
