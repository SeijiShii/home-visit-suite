// Package domain はドメインのインターフェースを定義する。
package domain

import "github.com/SeijiShii/home-visit-suite/shared/domain/models"

// RegionRepository は領域・区域親番・区域の永続化インターフェース。
// 初期実装はJSONファイル、将来はLinkSelfに差し替え可能。
type RegionRepository interface {
	// 領域
	ListRegions() ([]models.Region, error)
	GetRegion(id string) (*models.Region, error)
	SaveRegion(region *models.Region) error
	DeleteRegion(id string) error

	// 区域親番
	ListParentAreas(regionID string) ([]models.ParentArea, error)
	GetParentArea(id string) (*models.ParentArea, error)
	SaveParentArea(pa *models.ParentArea) error
	DeleteParentArea(id string) error

	// 区域
	ListAreas(parentAreaID string) ([]models.Area, error)
	GetArea(id string) (*models.Area, error)
	SaveArea(area *models.Area) error
	DeleteArea(id string) error
}
