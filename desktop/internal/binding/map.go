package binding

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sync"
)

const (
	polygonsFile = "polygons.json"
	draftsFile   = "drafts.json"
)

// MapBinding はmap-polygon-editorのStorageAdapter向けAPI。
// フロントエンドのWailsStorageAdapterから呼ばれる。
// JSONファイルに永続化。将来はLinkSelfに差し替え。
type MapBinding struct {
	mu       sync.RWMutex
	dir      string
	polygons []json.RawMessage
	groups   []json.RawMessage
	drafts   map[string]json.RawMessage
}

func NewMapBinding(dir string) (*MapBinding, error) {
	b := &MapBinding{
		dir:      dir,
		polygons: []json.RawMessage{},
		groups:   []json.RawMessage{},
		drafts:   make(map[string]json.RawMessage),
	}
	if err := b.loadFromDisk(); err != nil {
		return nil, fmt.Errorf("load map data: %w", err)
	}
	return b, nil
}

// GetPolygonsJSON は全ポリゴンをJSON配列で返す。
func (b *MapBinding) GetPolygonsJSON() (string, error) {
	b.mu.RLock()
	defer b.mu.RUnlock()

	data, err := json.Marshal(b.polygons)
	if err != nil {
		return "[]", err
	}
	return string(data), nil
}

// GetGroupsJSON は全グループをJSON配列で返す。
func (b *MapBinding) GetGroupsJSON() (string, error) {
	b.mu.RLock()
	defer b.mu.RUnlock()

	data, err := json.Marshal(b.groups)
	if err != nil {
		return "[]", err
	}
	return string(data), nil
}

// GetDraftsJSON は全下書きをJSON配列で返す。
func (b *MapBinding) GetDraftsJSON() (string, error) {
	b.mu.RLock()
	defer b.mu.RUnlock()

	result := make([]json.RawMessage, 0, len(b.drafts))
	for _, d := range b.drafts {
		result = append(result, d)
	}
	data, err := json.Marshal(result)
	if err != nil {
		return "[]", err
	}
	return string(data), nil
}

// changeSet はmap-polygon-editorのChangeSet構造。
type changeSet struct {
	CreatedPolygons   []json.RawMessage `json:"createdPolygons"`
	DeletedPolygonIds []string          `json:"deletedPolygonIds"`
	ModifiedPolygons  []json.RawMessage `json:"modifiedPolygons"`
	CreatedGroups     []json.RawMessage `json:"createdGroups"`
	DeletedGroupIds   []string          `json:"deletedGroupIds"`
	ModifiedGroups    []json.RawMessage `json:"modifiedGroups"`
}

// BatchWrite はChangeSetをJSON文字列で受け取り、一括書き込みする。
func (b *MapBinding) BatchWrite(changesJSON string) error {
	b.mu.Lock()
	defer b.mu.Unlock()

	var cs changeSet
	if err := json.Unmarshal([]byte(changesJSON), &cs); err != nil {
		return err
	}

	// ポリゴン: 削除
	for _, delID := range cs.DeletedPolygonIds {
		b.polygons = removeByID(b.polygons, delID)
	}
	// ポリゴン: 更新
	for _, mod := range cs.ModifiedPolygons {
		id := extractID(mod)
		b.polygons = removeByID(b.polygons, id)
		b.polygons = append(b.polygons, mod)
	}
	// ポリゴン: 追加
	b.polygons = append(b.polygons, cs.CreatedPolygons...)

	// グループ: 削除
	for _, delID := range cs.DeletedGroupIds {
		b.groups = removeByID(b.groups, delID)
	}
	// グループ: 更新
	for _, mod := range cs.ModifiedGroups {
		id := extractID(mod)
		b.groups = removeByID(b.groups, id)
		b.groups = append(b.groups, mod)
	}
	// グループ: 追加
	b.groups = append(b.groups, cs.CreatedGroups...)

	return b.savePolygonsToDisk()
}

// SaveDraft は下書きをJSON文字列で受け取り保存する。
func (b *MapBinding) SaveDraft(draftJSON string) error {
	b.mu.Lock()
	defer b.mu.Unlock()

	id := extractID(json.RawMessage(draftJSON))
	if id == "" {
		return nil
	}
	b.drafts[id] = json.RawMessage(draftJSON)
	return b.saveDraftsToDisk()
}

// DeleteDraft は下書きを削除する。
func (b *MapBinding) DeleteDraft(id string) error {
	b.mu.Lock()
	defer b.mu.Unlock()

	delete(b.drafts, id)
	return b.saveDraftsToDisk()
}

// --- File I/O ---

func (b *MapBinding) loadFromDisk() error {
	// polygons
	if data, err := os.ReadFile(filepath.Join(b.dir, polygonsFile)); err == nil {
		var items []json.RawMessage
		if err := json.Unmarshal(data, &items); err != nil {
			return fmt.Errorf("parse %s: %w", polygonsFile, err)
		}
		b.polygons = items
	} else if !os.IsNotExist(err) {
		return fmt.Errorf("read %s: %w", polygonsFile, err)
	}

	// drafts
	if data, err := os.ReadFile(filepath.Join(b.dir, draftsFile)); err == nil {
		var items []json.RawMessage
		if err := json.Unmarshal(data, &items); err != nil {
			return fmt.Errorf("parse %s: %w", draftsFile, err)
		}
		for _, item := range items {
			id := extractID(item)
			if id != "" {
				b.drafts[id] = item
			}
		}
	} else if !os.IsNotExist(err) {
		return fmt.Errorf("read %s: %w", draftsFile, err)
	}

	return nil
}

func (b *MapBinding) savePolygonsToDisk() error {
	return b.writeFile(polygonsFile, b.polygons)
}

func (b *MapBinding) saveDraftsToDisk() error {
	items := make([]json.RawMessage, 0, len(b.drafts))
	for _, d := range b.drafts {
		items = append(items, d)
	}
	return b.writeFile(draftsFile, items)
}

func (b *MapBinding) writeFile(filename string, data any) error {
	bytes, err := json.MarshalIndent(data, "", "  ")
	if err != nil {
		return fmt.Errorf("marshal %s: %w", filename, err)
	}
	path := filepath.Join(b.dir, filename)
	return os.WriteFile(path, bytes, 0644)
}

// extractID はJSONオブジェクトからidフィールドを抽出する。
func extractID(raw json.RawMessage) string {
	var obj struct {
		ID string `json:"id"`
	}
	if err := json.Unmarshal(raw, &obj); err != nil {
		return ""
	}
	return obj.ID
}

// removeByID はJSON配列からidが一致する要素を除去する。
func removeByID(items []json.RawMessage, id string) []json.RawMessage {
	result := make([]json.RawMessage, 0, len(items))
	for _, item := range items {
		if extractID(item) != id {
			result = append(result, item)
		}
	}
	return result
}
