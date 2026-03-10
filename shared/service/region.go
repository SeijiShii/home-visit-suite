package service

import "github.com/SeijiShii/home-visit-suite/shared/domain/models"

// RegionService は領域・区域の管理ロジック。
type RegionService interface {
	// CreateRegion は領域を作成する（管理者のみ）。
	CreateRegion(actorID string, name, symbol string) (*models.Region, error)

	// CreateParentArea は区域親番を作成する（編集スタッフ以上）。
	CreateParentArea(actorID string, regionID, number, name string) (*models.ParentArea, error)

	// CreateArea は区域を作成する（編集スタッフ以上）。
	CreateArea(actorID string, parentAreaID, number string) (*models.Area, error)

	// ApproveRegion は領域内の区域を承認する（管理者のみ）。
	// 承認後は編集スタッフによる区域・区域親番の削除が不可になる。
	ApproveRegion(actorID string, regionID string) error

	// DeleteArea は区域を削除する（管理者のみ、承認後も可能）。
	DeleteArea(actorID string, areaID string) error
}
