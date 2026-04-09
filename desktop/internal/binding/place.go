// Package binding はWailsフロントエンドに公開するAPIを定義する。
package binding

import (
	"time"

	"github.com/SeijiShii/home-visit-suite/shared/domain"
	"github.com/SeijiShii/home-visit-suite/shared/domain/models"
	"github.com/google/uuid"
)

// PlaceBinding は場所(住宅情報)管理のフロントエンド向けAPI。
type PlaceBinding struct {
	repo domain.PlaceRepository
}

func NewPlaceBinding(repo domain.PlaceRepository) *PlaceBinding {
	return &PlaceBinding{repo: repo}
}

// ListPlaces は指定区域内のアクティブな場所一覧を返す。
func (b *PlaceBinding) ListPlaces(areaID string) ([]models.Place, error) {
	return b.repo.ListPlaces(areaID)
}

// GetPlace はIDで場所を取得する。
func (b *PlaceBinding) GetPlace(id string) (*models.Place, error) {
	return b.repo.GetPlace(id)
}

// SavePlace は場所を保存する（新規作成・更新兼用）。
// ID が空の場合は UUID を採番する。
func (b *PlaceBinding) SavePlace(place *models.Place) (*models.Place, error) {
	now := time.Now()
	if place.ID == "" {
		place.ID = uuid.NewString()
		place.CreatedAt = now
	}
	place.UpdatedAt = now
	if err := b.repo.SavePlace(place); err != nil {
		return nil, err
	}
	return place, nil
}

// DeletePlace は場所を論理削除する。
func (b *PlaceBinding) DeletePlace(id string) error {
	return b.repo.DeletePlace(id)
}

// ListDeletedPlacesNear は指定座標から半径radiusMetersメートル以内の削除済み場所を返す。
func (b *PlaceBinding) ListDeletedPlacesNear(lat, lng, radiusMeters float64) ([]models.Place, error) {
	return b.repo.ListDeletedPlacesNear(lat, lng, radiusMeters)
}
