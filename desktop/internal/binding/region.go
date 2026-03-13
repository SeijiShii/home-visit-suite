// Package binding はWailsフロントエンドに公開するAPIを定義する。
package binding

import (
	"fmt"

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

// DeleteRegion は領域を論理削除する。
func (b *RegionBinding) DeleteRegion(id string) error {
	return b.repo.DeleteRegion(id)
}

// RestoreRegion は論理削除された領域を復元する（アプリ層のアンドゥ操作）。
func (b *RegionBinding) RestoreRegion(id string) error {
	r, err := b.repo.GetRegionRaw(id)
	if err != nil {
		return err
	}
	if r.DeletedAt == nil {
		return fmt.Errorf("region not deleted: %s", id)
	}
	r.DeletedAt = nil
	return b.repo.SaveRegion(r)
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

// DeleteParentArea は区域親番を論理削除する。
func (b *RegionBinding) DeleteParentArea(id string) error {
	return b.repo.DeleteParentArea(id)
}

// RestoreParentArea は論理削除された区域親番を復元する（アプリ層のアンドゥ操作）。
func (b *RegionBinding) RestoreParentArea(id string) error {
	pa, err := b.repo.GetParentAreaRaw(id)
	if err != nil {
		return err
	}
	if pa.DeletedAt == nil {
		return fmt.Errorf("parent area not deleted: %s", id)
	}
	pa.DeletedAt = nil
	return b.repo.SaveParentArea(pa)
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

// DeleteArea は区域を論理削除する。
func (b *RegionBinding) DeleteArea(id string) error {
	return b.repo.DeleteArea(id)
}

// RestoreArea は論理削除された区域を復元する（アプリ層のアンドゥ操作）。
func (b *RegionBinding) RestoreArea(id string) error {
	a, err := b.repo.GetAreaRaw(id)
	if err != nil {
		return err
	}
	if a.DeletedAt == nil {
		return fmt.Errorf("area not deleted: %s", id)
	}
	a.DeletedAt = nil
	return b.repo.SaveArea(a)
}

// --- ユーティリティ ---

// GetAreaDisplayLabel は区域の表示ラベルを返す。
func (b *RegionBinding) GetAreaDisplayLabel(regionSymbol, parentNumber, areaNumber, parentName string) string {
	return models.AreaDisplayLabel(regionSymbol, parentNumber, areaNumber, parentName)
}
