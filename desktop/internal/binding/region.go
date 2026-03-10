// Package binding はWailsフロントエンドに公開するAPIを定義する。
package binding

import "github.com/SeijiShii/home-visit-suite/shared/domain/models"

// RegionBinding は領域・区域管理のフロントエンド向けAPI。
type RegionBinding struct{}

func NewRegionBinding() *RegionBinding {
	return &RegionBinding{}
}

// ListRegions は全領域を返す。
func (b *RegionBinding) ListRegions() ([]models.Region, error) {
	// TODO: LinkSelfからデータ取得
	return nil, nil
}

// GetAreaDisplayLabel は区域の表示ラベルを返す。
func (b *RegionBinding) GetAreaDisplayLabel(regionSymbol, parentNumber, areaNumber, parentName string) string {
	return models.AreaDisplayLabel(regionSymbol, parentNumber, areaNumber, parentName)
}
