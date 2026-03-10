// Package binding はWailsフロントエンドに公開するAPIを定義する。
package binding

import (
	"github.com/SeijiShii/home-visit-suite/shared/domain"
	"github.com/SeijiShii/home-visit-suite/shared/domain/models"
)

// RegionBinding は領域・区域管理のフロントエンド向けAPI。
type RegionBinding struct {
	repo domain.RegionRepository
}

func NewRegionBinding(repo domain.RegionRepository) *RegionBinding {
	return &RegionBinding{repo: repo}
}

// --- 領域 ---

// ListRegions は全領域を返す。
func (b *RegionBinding) ListRegions() ([]models.Region, error) {
	return b.repo.ListRegions()
}

// GetRegion は指定IDの領域を返す。
func (b *RegionBinding) GetRegion(id string) (*models.Region, error) {
	return b.repo.GetRegion(id)
}

// SaveRegion は領域を保存する（新規作成・更新兼用）。
func (b *RegionBinding) SaveRegion(region *models.Region) error {
	return b.repo.SaveRegion(region)
}

// DeleteRegion は領域を削除する。
func (b *RegionBinding) DeleteRegion(id string) error {
	return b.repo.DeleteRegion(id)
}

// --- 区域親番 ---

// ListParentAreas は指定領域の区域親番一覧を返す。
func (b *RegionBinding) ListParentAreas(regionID string) ([]models.ParentArea, error) {
	return b.repo.ListParentAreas(regionID)
}

// GetParentArea は指定IDの区域親番を返す。
func (b *RegionBinding) GetParentArea(id string) (*models.ParentArea, error) {
	return b.repo.GetParentArea(id)
}

// SaveParentArea は区域親番を保存する。
func (b *RegionBinding) SaveParentArea(pa *models.ParentArea) error {
	return b.repo.SaveParentArea(pa)
}

// DeleteParentArea は区域親番を削除する。
func (b *RegionBinding) DeleteParentArea(id string) error {
	return b.repo.DeleteParentArea(id)
}

// --- 区域 ---

// ListAreas は指定区域親番の区域一覧を返す。
func (b *RegionBinding) ListAreas(parentAreaID string) ([]models.Area, error) {
	return b.repo.ListAreas(parentAreaID)
}

// GetArea は指定IDの区域を返す。
func (b *RegionBinding) GetArea(id string) (*models.Area, error) {
	return b.repo.GetArea(id)
}

// SaveArea は区域を保存する。
func (b *RegionBinding) SaveArea(area *models.Area) error {
	return b.repo.SaveArea(area)
}

// DeleteArea は区域を削除する。
func (b *RegionBinding) DeleteArea(id string) error {
	return b.repo.DeleteArea(id)
}

// --- ユーティリティ ---

// GetAreaDisplayLabel は区域の表示ラベルを返す。
func (b *RegionBinding) GetAreaDisplayLabel(regionSymbol, parentNumber, areaNumber, parentName string) string {
	return models.AreaDisplayLabel(regionSymbol, parentNumber, areaNumber, parentName)
}
