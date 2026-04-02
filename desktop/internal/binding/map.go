package binding

import (
	"sync"

	"github.com/SeijiShii/home-visit-suite/shared/domain/repository"
)

// MapBinding はmap-polygon-editor v3のStorageAdapter向けAPI。
// フロントエンドのWailsStorageAdapterから呼ばれる。
// LinkSelf MyDB経由で永続化・同期。
type MapBinding struct {
	mu   sync.RWMutex
	repo *repository.LinkSelfMapRepo
}

func NewMapBinding(repo *repository.LinkSelfMapRepo) *MapBinding {
	return &MapBinding{repo: repo}
}

// GetNetworkJSON はネットワーク全体({vertices, edges, polygons})をJSON文字列で返す。
func (b *MapBinding) GetNetworkJSON() (string, error) {
	b.mu.RLock()
	defer b.mu.RUnlock()
	return b.repo.GetNetworkJSON()
}

// SaveNetworkJSON はネットワーク全体をJSON文字列で受け取り保存する。
func (b *MapBinding) SaveNetworkJSON(networkJSON string) error {
	b.mu.Lock()
	defer b.mu.Unlock()
	return b.repo.SaveNetworkJSON(networkJSON)
}
