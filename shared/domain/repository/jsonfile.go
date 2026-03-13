package repository

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sync"
	"time"

	"github.com/SeijiShii/home-visit-suite/shared/domain/models"
)

const (
	regionsFile     = "regions.json"
	parentAreasFile = "parent_areas.json"
	areasFile       = "areas.json"
)

// jsonFileData はJSONファイルに永続化するデータ構造。
type jsonFileData struct {
	Regions     []*models.Region     `json:"regions"`
	ParentAreas []*models.ParentArea `json:"parentAreas"`
	Areas       []*models.Area       `json:"areas"`
}

// JSONFileRepository はローカルJSONファイルによるリポジトリ実装。
type JSONFileRepository struct {
	mu  sync.RWMutex
	dir string

	regions     map[string]*models.Region
	parentAreas map[string]*models.ParentArea
	areas       map[string]*models.Area
}

// NewJSONFileRepository は指定ディレクトリを使うJSONFileRepositoryを生成する。
// 既存ファイルがあれば読み込む。
func NewJSONFileRepository(dir string) (*JSONFileRepository, error) {
	info, err := os.Stat(dir)
	if err != nil {
		return nil, fmt.Errorf("invalid directory: %w", err)
	}
	if !info.IsDir() {
		return nil, fmt.Errorf("not a directory: %s", dir)
	}

	repo := &JSONFileRepository{
		dir:         dir,
		regions:     make(map[string]*models.Region),
		parentAreas: make(map[string]*models.ParentArea),
		areas:       make(map[string]*models.Area),
	}

	if err := repo.loadFile(regionsFile, &repo.regions); err != nil {
		return nil, err
	}
	if err := repo.loadFile(parentAreasFile, &repo.parentAreas); err != nil {
		return nil, err
	}
	if err := repo.loadFile(areasFile, &repo.areas); err != nil {
		return nil, err
	}

	return repo, nil
}

// --- Region ---

func (r *JSONFileRepository) ListRegions() ([]models.Region, error) {
	r.mu.RLock()
	defer r.mu.RUnlock()

	result := make([]models.Region, 0, len(r.regions))
	for _, v := range r.regions {
		if v.DeletedAt == nil {
			result = append(result, *v)
		}
	}
	return result, nil
}

func (r *JSONFileRepository) GetRegion(id string) (*models.Region, error) {
	r.mu.RLock()
	defer r.mu.RUnlock()

	v, ok := r.regions[id]
	if !ok || v.DeletedAt != nil {
		return nil, fmt.Errorf("region not found: %s", id)
	}
	copy := *v
	return &copy, nil
}

func (r *JSONFileRepository) GetRegionRaw(id string) (*models.Region, error) {
	r.mu.RLock()
	defer r.mu.RUnlock()

	v, ok := r.regions[id]
	if !ok {
		return nil, fmt.Errorf("region not found: %s", id)
	}
	copy := *v
	return &copy, nil
}

func (r *JSONFileRepository) SaveRegion(region *models.Region) error {
	r.mu.Lock()
	defer r.mu.Unlock()

	copy := *region
	r.regions[region.ID] = &copy
	return r.saveFile(regionsFile, r.regions)
}

func (r *JSONFileRepository) DeleteRegion(id string) error {
	r.mu.Lock()
	defer r.mu.Unlock()

	v, ok := r.regions[id]
	if !ok || v.DeletedAt != nil {
		return fmt.Errorf("region not found: %s", id)
	}
	now := time.Now()
	v.DeletedAt = &now
	return r.saveFile(regionsFile, r.regions)
}

// --- ParentArea ---

func (r *JSONFileRepository) ListParentAreas(regionID string) ([]models.ParentArea, error) {
	r.mu.RLock()
	defer r.mu.RUnlock()

	var result []models.ParentArea
	for _, v := range r.parentAreas {
		if v.RegionID == regionID && v.DeletedAt == nil {
			result = append(result, *v)
		}
	}
	return result, nil
}

func (r *JSONFileRepository) GetParentArea(id string) (*models.ParentArea, error) {
	r.mu.RLock()
	defer r.mu.RUnlock()

	v, ok := r.parentAreas[id]
	if !ok || v.DeletedAt != nil {
		return nil, fmt.Errorf("parent area not found: %s", id)
	}
	copy := *v
	return &copy, nil
}

func (r *JSONFileRepository) GetParentAreaRaw(id string) (*models.ParentArea, error) {
	r.mu.RLock()
	defer r.mu.RUnlock()

	v, ok := r.parentAreas[id]
	if !ok {
		return nil, fmt.Errorf("parent area not found: %s", id)
	}
	copy := *v
	return &copy, nil
}

func (r *JSONFileRepository) SaveParentArea(pa *models.ParentArea) error {
	r.mu.Lock()
	defer r.mu.Unlock()

	copy := *pa
	r.parentAreas[pa.ID] = &copy
	return r.saveFile(parentAreasFile, r.parentAreas)
}

func (r *JSONFileRepository) DeleteParentArea(id string) error {
	r.mu.Lock()
	defer r.mu.Unlock()

	v, ok := r.parentAreas[id]
	if !ok || v.DeletedAt != nil {
		return fmt.Errorf("parent area not found: %s", id)
	}
	now := time.Now()
	v.DeletedAt = &now
	return r.saveFile(parentAreasFile, r.parentAreas)
}

// --- Area ---

func (r *JSONFileRepository) ListAreas(parentAreaID string) ([]models.Area, error) {
	r.mu.RLock()
	defer r.mu.RUnlock()

	var result []models.Area
	for _, v := range r.areas {
		if v.ParentAreaID == parentAreaID && v.DeletedAt == nil {
			result = append(result, *v)
		}
	}
	return result, nil
}

func (r *JSONFileRepository) GetArea(id string) (*models.Area, error) {
	r.mu.RLock()
	defer r.mu.RUnlock()

	v, ok := r.areas[id]
	if !ok || v.DeletedAt != nil {
		return nil, fmt.Errorf("area not found: %s", id)
	}
	copy := *v
	return &copy, nil
}

func (r *JSONFileRepository) GetAreaRaw(id string) (*models.Area, error) {
	r.mu.RLock()
	defer r.mu.RUnlock()

	v, ok := r.areas[id]
	if !ok {
		return nil, fmt.Errorf("area not found: %s", id)
	}
	copy := *v
	return &copy, nil
}

func (r *JSONFileRepository) SaveArea(area *models.Area) error {
	r.mu.Lock()
	defer r.mu.Unlock()

	copy := *area
	r.areas[area.ID] = &copy
	return r.saveFile(areasFile, r.areas)
}

func (r *JSONFileRepository) DeleteArea(id string) error {
	r.mu.Lock()
	defer r.mu.Unlock()

	v, ok := r.areas[id]
	if !ok || v.DeletedAt != nil {
		return fmt.Errorf("area not found: %s", id)
	}
	now := time.Now()
	v.DeletedAt = &now
	return r.saveFile(areasFile, r.areas)
}

// --- File I/O helpers ---

// loadFile はJSONファイルを読み込んでmapに格納する。
// ファイルが存在しない場合は空のままで正常終了する。
func (r *JSONFileRepository) loadFile(filename string, dest any) error {
	path := filepath.Join(r.dir, filename)
	data, err := os.ReadFile(path)
	if err != nil {
		if os.IsNotExist(err) {
			return nil
		}
		return fmt.Errorf("read %s: %w", path, err)
	}

	switch d := dest.(type) {
	case *map[string]*models.Region:
		var items []models.Region
		if err := json.Unmarshal(data, &items); err != nil {
			return fmt.Errorf("parse %s: %w", filename, err)
		}
		for i := range items {
			(*d)[items[i].ID] = &items[i]
		}
	case *map[string]*models.ParentArea:
		var items []models.ParentArea
		if err := json.Unmarshal(data, &items); err != nil {
			return fmt.Errorf("parse %s: %w", filename, err)
		}
		for i := range items {
			(*d)[items[i].ID] = &items[i]
		}
	case *map[string]*models.Area:
		var items []models.Area
		if err := json.Unmarshal(data, &items); err != nil {
			return fmt.Errorf("parse %s: %w", filename, err)
		}
		for i := range items {
			(*d)[items[i].ID] = &items[i]
		}
	}

	return nil
}

// saveFile はmapの内容をJSON配列としてファイルに書き出す。
// 論理削除されたアイテムも含めて保存する（復元可能にするため）。
func (r *JSONFileRepository) saveFile(filename string, src any) error {
	var items any

	switch s := src.(type) {
	case map[string]*models.Region:
		list := make([]models.Region, 0, len(s))
		for _, v := range s {
			list = append(list, *v)
		}
		items = list
	case map[string]*models.ParentArea:
		list := make([]models.ParentArea, 0, len(s))
		for _, v := range s {
			list = append(list, *v)
		}
		items = list
	case map[string]*models.Area:
		list := make([]models.Area, 0, len(s))
		for _, v := range s {
			list = append(list, *v)
		}
		items = list
	}

	data, err := json.MarshalIndent(items, "", "  ")
	if err != nil {
		return fmt.Errorf("marshal %s: %w", filename, err)
	}

	path := filepath.Join(r.dir, filename)
	return os.WriteFile(path, data, 0644)
}
