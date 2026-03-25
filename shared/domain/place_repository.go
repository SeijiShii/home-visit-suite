package domain

import "github.com/SeijiShii/home-visit-suite/shared/domain/models"

// PlaceRepository は場所データの永続化インターフェース。
type PlaceRepository interface {
	ListPlaces(areaID string) ([]models.Place, error)
	GetPlace(id string) (*models.Place, error)
	SavePlace(place *models.Place) error
	DeletePlace(id string) error
}
