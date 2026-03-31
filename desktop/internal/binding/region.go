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

// BindPolygonToArea は区域にポリゴンIDを紐付ける。
func (b *RegionBinding) BindPolygonToArea(areaID, polygonID string) error {
	a, err := b.repo.GetArea(areaID)
	if err != nil {
		return fmt.Errorf("get area %s: %w", areaID, err)
	}
	a.PolygonID = polygonID
	return b.repo.SaveArea(a)
}

// UnbindPolygonFromArea は区域からポリゴンIDの紐付けを解除する。
func (b *RegionBinding) UnbindPolygonFromArea(areaID string) error {
	a, err := b.repo.GetArea(areaID)
	if err != nil {
		return fmt.Errorf("get area %s: %w", areaID, err)
	}
	a.PolygonID = ""
	return b.repo.SaveArea(a)
}

// RemapPolygonIds はポリゴンIDの変更を全区域に反映する。
// map-polygon-editor の init() でポリゴンIDが再生成されるため、
// 起動時に旧ID→新IDのマッピングで区域の紐付けを更新する。
func (b *RegionBinding) RemapPolygonIds(idMap map[string]string) error {
	if len(idMap) == 0 {
		return nil
	}
	regions, err := b.repo.ListRegions()
	if err != nil {
		return fmt.Errorf("list regions: %w", err)
	}
	for _, region := range regions {
		parentAreas, err := b.repo.ListParentAreas(region.ID)
		if err != nil {
			return fmt.Errorf("list parent areas for %s: %w", region.ID, err)
		}
		for _, pa := range parentAreas {
			areas, err := b.repo.ListAreas(pa.ID)
			if err != nil {
				return fmt.Errorf("list areas for %s: %w", pa.ID, err)
			}
			for _, area := range areas {
				if area.PolygonID == "" {
					continue
				}
				if newID, ok := idMap[area.PolygonID]; ok {
					area := area // ループ変数コピー
					area.PolygonID = newID
					if err := b.repo.SaveArea(&area); err != nil {
						return fmt.Errorf("save area %s: %w", area.ID, err)
					}
				}
			}
		}
	}
	return nil
}

// --- 区域親番数の管理 ---

// SetParentAreaCount は指定領域の区域親番数を変更する。
// 増加時は連番で新規ParentAreaを作成し、減少時は末尾から削除する。
// 削除される親番配下の区域のポリゴン紐づきは解除される。
func (b *RegionBinding) SetParentAreaCount(regionID string, count int) error {
	if count < 0 {
		return fmt.Errorf("count must be >= 0, got %d", count)
	}

	// 領域の存在確認
	if _, err := b.repo.GetRegion(regionID); err != nil {
		return fmt.Errorf("get region %s: %w", regionID, err)
	}

	current, err := b.repo.ListParentAreas(regionID)
	if err != nil {
		return fmt.Errorf("list parent areas: %w", err)
	}

	if len(current) == count {
		return nil
	}

	if count > len(current) {
		// 増加: 最大番号の次から連番で作成
		maxNum := 0
		for _, pa := range current {
			n := 0
			fmt.Sscanf(pa.Number, "%d", &n)
			if n > maxNum {
				maxNum = n
			}
		}
		for i := maxNum + 1; i <= maxNum+(count-len(current)); i++ {
			number := fmt.Sprintf("%03d", i)
			id := fmt.Sprintf("%s-%s", regionID, number)
			pa := &models.ParentArea{
				ID:       id,
				RegionID: regionID,
				Number:   number,
				Name:     "",
			}
			if err := b.repo.SaveParentArea(pa); err != nil {
				return fmt.Errorf("save parent area %s: %w", id, err)
			}
		}
		return nil
	}

	// 減少: 番号が大きい順に削除
	// 番号降順でソート
	sorted := make([]models.ParentArea, len(current))
	copy(sorted, current)
	for i := 0; i < len(sorted)-1; i++ {
		for j := i + 1; j < len(sorted); j++ {
			if sorted[i].Number < sorted[j].Number {
				sorted[i], sorted[j] = sorted[j], sorted[i]
			}
		}
	}

	toDelete := len(current) - count
	for i := 0; i < toDelete; i++ {
		pa := sorted[i]
		// 配下の区域を処理
		areas, err := b.repo.ListAreas(pa.ID)
		if err != nil {
			return fmt.Errorf("list areas for %s: %w", pa.ID, err)
		}
		for _, area := range areas {
			// ポリゴン紐づき解除
			if area.PolygonID != "" {
				area := area
				area.PolygonID = ""
				if err := b.repo.SaveArea(&area); err != nil {
					return fmt.Errorf("unbind polygon from area %s: %w", area.ID, err)
				}
			}
			// 区域を論理削除
			if err := b.repo.DeleteArea(area.ID); err != nil {
				return fmt.Errorf("delete area %s: %w", area.ID, err)
			}
		}
		// 親番を論理削除
		if err := b.repo.DeleteParentArea(pa.ID); err != nil {
			return fmt.Errorf("delete parent area %s: %w", pa.ID, err)
		}
	}

	return nil
}

// --- 領域更新 ---

// UpdateRegion は領域の名前・記号を更新する。
// 記号が変更された場合、配下のParentArea・AreaのIDを連鎖更新する。
// 更新順序: Area → ParentArea → Region（子から親へ、参照整合性のため）。
func (b *RegionBinding) UpdateRegion(id, name, newSymbol string) error {
	r, err := b.repo.GetRegion(id)
	if err != nil {
		return err
	}

	oldSymbol := r.Symbol

	// 記号が変わらない場合は名前のみ更新
	if oldSymbol == newSymbol {
		r.Name = name
		return b.repo.SaveRegion(r)
	}

	// 記号が変わる場合: 子 → 親の順でID連鎖更新
	parentAreas, err := b.repo.ListParentAreas(id)
	if err != nil {
		return fmt.Errorf("list parent areas: %w", err)
	}

	// 1. Area: 旧ID削除 → 新ID保存
	for _, pa := range parentAreas {
		areas, err := b.repo.ListAreas(pa.ID)
		if err != nil {
			return fmt.Errorf("list areas for %s: %w", pa.ID, err)
		}
		newPaID := newSymbol + pa.ID[len(oldSymbol):]
		for _, a := range areas {
			newAreaID := newSymbol + a.ID[len(oldSymbol):]
			if err := b.repo.RemoveArea(a.ID); err != nil {
				return fmt.Errorf("remove area %s: %w", a.ID, err)
			}
			a.ID = newAreaID
			a.ParentAreaID = newPaID
			if err := b.repo.SaveArea(&a); err != nil {
				return fmt.Errorf("save area %s: %w", newAreaID, err)
			}
		}
	}

	// 2. ParentArea: 旧ID削除 → 新ID保存
	for _, pa := range parentAreas {
		newPaID := newSymbol + pa.ID[len(oldSymbol):]
		if err := b.repo.RemoveParentArea(pa.ID); err != nil {
			return fmt.Errorf("remove parent area %s: %w", pa.ID, err)
		}
		pa.ID = newPaID
		pa.RegionID = newSymbol
		if err := b.repo.SaveParentArea(&pa); err != nil {
			return fmt.Errorf("save parent area %s: %w", newPaID, err)
		}
	}

	// 3. Region: 旧ID削除 → 新ID保存
	if err := b.repo.RemoveRegion(id); err != nil {
		return fmt.Errorf("remove region %s: %w", id, err)
	}
	r.ID = newSymbol
	r.Symbol = newSymbol
	r.Name = name
	return b.repo.SaveRegion(r)
}

// --- 並び替え ---

// ReorderRegions は領域の表示順を更新する。idsは新しい順序のID配列。
func (b *RegionBinding) ReorderRegions(ids []string) error {
	for i, id := range ids {
		r, err := b.repo.GetRegionRaw(id)
		if err != nil {
			return err
		}
		r.Order = i
		if err := b.repo.SaveRegion(r); err != nil {
			return err
		}
	}
	return nil
}

// --- ユーティリティ ---

// GetAreaDisplayLabel は区域の表示ラベルを返す。
func (b *RegionBinding) GetAreaDisplayLabel(regionSymbol, parentNumber, areaNumber, parentName string) string {
	return models.AreaDisplayLabel(regionSymbol, parentNumber, areaNumber, parentName)
}
