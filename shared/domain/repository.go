// Package domain はドメインのインターフェースを定義する。
package domain

import "github.com/SeijiShii/home-visit-suite/shared/domain/models"

// RegionRepository は領域・区域親番・区域の永続化インターフェース。
// 初期実装はJSONファイル、将来はLinkSelfに差し替え可能。
// Delete は論理削除（DeletedAt にタイムスタンプ設定）。
// 復元（Restore）はアプリケーション層の責務（GetRaw → DeletedAt=nil → Save）。
type RegionRepository interface {
	// 領域
	ListRegions() ([]models.Region, error)
	GetRegion(id string) (*models.Region, error)
	GetRegionRaw(id string) (*models.Region, error) // DeletedAt状態に関係なく取得
	SaveRegion(region *models.Region) error
	DeleteRegion(id string) error
	RemoveRegion(id string) error // 物理削除（ID変更時に使用）

	// 区域親番
	ListParentAreas(regionID string) ([]models.ParentArea, error)
	GetParentArea(id string) (*models.ParentArea, error)
	GetParentAreaRaw(id string) (*models.ParentArea, error)
	SaveParentArea(pa *models.ParentArea) error
	DeleteParentArea(id string) error
	RemoveParentArea(id string) error // 物理削除

	// 区域
	ListAreas(parentAreaID string) ([]models.Area, error)
	GetArea(id string) (*models.Area, error)
	GetAreaRaw(id string) (*models.Area, error)
	SaveArea(area *models.Area) error
	DeleteArea(id string) error
	RemoveArea(id string) error // 物理削除
}
