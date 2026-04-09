package domain

import "github.com/SeijiShii/home-visit-suite/shared/domain/models"

// PlaceRepository は場所データの永続化インターフェース。
type PlaceRepository interface {
	ListPlaces(areaID string) ([]models.Place, error)
	GetPlace(id string) (*models.Place, error)
	SavePlace(place *models.Place) error
	// DeletePlace は論理削除（DeletedAt をセット）。
	DeletePlace(id string) error
	// ListDeletedPlacesNear は指定座標から半径 radiusMeters メートル以内の削除済み場所を返す。
	ListDeletedPlacesNear(lat, lng, radiusMeters float64) ([]models.Place, error)
}
