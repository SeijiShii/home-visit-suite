package binding

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sync"
)

const networkFile = "network.json"

// MapBinding はmap-polygon-editor v3のStorageAdapter向けAPI。
// フロントエンドのWailsStorageAdapterから呼ばれる。
// JSONファイルに永続化。将来はLinkSelfに差し替え。
type MapBinding struct {
	mu   sync.RWMutex
	dir  string
	data json.RawMessage // {vertices, edges, polygons}
}

func NewMapBinding(dir string) (*MapBinding, error) {
	b := &MapBinding{
		dir:  dir,
		data: json.RawMessage(`{"vertices":[],"edges":[],"polygons":[]}`),
	}
	if err := b.loadFromDisk(); err != nil {
		return nil, fmt.Errorf("load map data: %w", err)
	}
	return b, nil
}

// GetNetworkJSON はネットワーク全体({vertices, edges, polygons})をJSON文字列で返す。
func (b *MapBinding) GetNetworkJSON() (string, error) {
	b.mu.RLock()
	defer b.mu.RUnlock()

	return string(b.data), nil
}

// SaveNetworkJSON はネットワーク全体をJSON文字列で受け取り保存する。
func (b *MapBinding) SaveNetworkJSON(networkJSON string) error {
	b.mu.Lock()
	defer b.mu.Unlock()

	b.data = json.RawMessage(networkJSON)
	return b.saveToDisk()
}

// --- File I/O ---

func (b *MapBinding) loadFromDisk() error {
	path := filepath.Join(b.dir, networkFile)
	data, err := os.ReadFile(path)
	if err != nil {
		if os.IsNotExist(err) {
			return nil // ファイルなし → デフォルト空データのまま
		}
		return fmt.Errorf("read %s: %w", networkFile, err)
	}

	// JSONとして有効か検証
	if !json.Valid(data) {
		return fmt.Errorf("invalid JSON in %s", networkFile)
	}

	b.data = data
	return nil
}

func (b *MapBinding) saveToDisk() error {
	// 整形して保存
	var parsed any
	if err := json.Unmarshal(b.data, &parsed); err != nil {
		return fmt.Errorf("parse network data: %w", err)
	}
	bytes, err := json.MarshalIndent(parsed, "", "  ")
	if err != nil {
		return fmt.Errorf("marshal %s: %w", networkFile, err)
	}
	path := filepath.Join(b.dir, networkFile)
	return os.WriteFile(path, bytes, 0644)
}
