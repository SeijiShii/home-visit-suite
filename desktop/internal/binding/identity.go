package binding

import (
	"errors"
	"fmt"
	"sync"

	"github.com/SeijiShii/home-visit-suite/shared/domain"
	"github.com/SeijiShii/home-visit-suite/shared/domain/models"
)

// IdentityBinding は「フロントエンドが API 呼び出し時に渡す actorID」を一元管理する。
//
// 開発モード（HVS_DEV=1）が有効な場合のみ、設定画面のアイデンティティ切替 UI から
// SetCurrentActor で別ユーザーへ切り替え可能。本番モードでは常に実 LinkSelf DID を返す。
//
// 仕様: docs/wants/CLAUDE.md の開発方針および G0「dev 用アイデンティティ切替基盤」
type IdentityBinding struct {
	realDID  string
	current  string
	userRepo domain.UserRepository
	devMode  bool
	mu       sync.RWMutex
}

// NewIdentityBinding は新しい IdentityBinding を生成する。
// realDID は LinkSelf 起動時に取得した自デバイスの DID。
// devMode が true のとき、SetCurrentActor / ListAvailableIdentities が利用可能になる。
func NewIdentityBinding(realDID string, userRepo domain.UserRepository, devMode bool) *IdentityBinding {
	return &IdentityBinding{
		realDID:  realDID,
		current:  realDID,
		userRepo: userRepo,
		devMode:  devMode,
	}
}

// IsDevMode は開発モードが有効かを返す。
// フロントエンドはこの値で「アイデンティティ切替セクション」の表示を分岐する。
func (b *IdentityBinding) IsDevMode() bool {
	return b.devMode
}

// GetRealDID は LinkSelf 起動時の実 DID を返す。
// 「[自分]」表示や、本番モードでの actorID 取得に使う。
func (b *IdentityBinding) GetRealDID() string {
	return b.realDID
}

// GetCurrentActor は現在のアクター DID を返す。
// 本番モードでは realDID と一致。dev モードで切替されている場合は切替後の DID。
func (b *IdentityBinding) GetCurrentActor() string {
	b.mu.RLock()
	defer b.mu.RUnlock()
	return b.current
}

// SetCurrentActor は現在のアクターを別ユーザーへ切り替える。dev モードのみ有効。
// 切り替え対象 DID はユーザーリポジトリに登録済みである必要がある。
func (b *IdentityBinding) SetCurrentActor(did string) error {
	if !b.devMode {
		return errors.New("identity switch is dev-only (HVS_DEV not set)")
	}
	if _, err := b.userRepo.GetUser(did); err != nil {
		return fmt.Errorf("user not found: %s", did)
	}
	b.mu.Lock()
	b.current = did
	b.mu.Unlock()
	return nil
}

// ListAvailableIdentities は dev モードで切替可能なユーザー一覧を返す。
// 本番モードではエラーを返す。
func (b *IdentityBinding) ListAvailableIdentities() ([]models.User, error) {
	if !b.devMode {
		return nil, errors.New("identity switch is dev-only (HVS_DEV not set)")
	}
	return b.userRepo.ListUsers()
}
