package repository

import (
	"fmt"
	"math"
	"sort"
	"sync"
	"time"

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
		if v.AreaID == areaID && v.DeletedAt == nil {
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

// DeletePlace は論理削除を行う（DeletedAt をセット）。
func (r *InMemoryPlaceRepository) DeletePlace(id string) error {
	r.mu.Lock()
	defer r.mu.Unlock()

	v, ok := r.places[id]
	if !ok {
		return fmt.Errorf("place not found: %s", id)
	}
	now := time.Now()
	v.DeletedAt = &now
	return nil
}

// ListDeletedPlacesNear は指定座標から半径 radiusMeters メートル以内の削除済み場所を返す。
func (r *InMemoryPlaceRepository) ListDeletedPlacesNear(lat, lng, radiusMeters float64) ([]models.Place, error) {
	r.mu.RLock()
	defer r.mu.RUnlock()

	var result []models.Place
	for _, v := range r.places {
		if v.DeletedAt == nil {
			continue
		}
		if haversineMeters(lat, lng, v.Coord.Lat, v.Coord.Lng) <= radiusMeters {
			result = append(result, *v)
		}
	}
	return result, nil
}

// haversineMeters は2点間の距離をメートルで返す。
func haversineMeters(lat1, lng1, lat2, lng2 float64) float64 {
	const earthRadiusM = 6371000.0
	toRad := func(d float64) float64 { return d * math.Pi / 180.0 }
	dLat := toRad(lat2 - lat1)
	dLng := toRad(lng2 - lng1)
	a := math.Sin(dLat/2)*math.Sin(dLat/2) +
		math.Cos(toRad(lat1))*math.Cos(toRad(lat2))*
			math.Sin(dLng/2)*math.Sin(dLng/2)
	c := 2 * math.Atan2(math.Sqrt(a), math.Sqrt(1-a))
	return earthRadiusM * c
}
