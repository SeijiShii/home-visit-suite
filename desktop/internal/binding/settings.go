package binding

import (
	"github.com/SeijiShii/home-visit-suite/shared/domain"
)

// SettingsBinding はアプリ設定（ヘルプ表示状態・UI言語など）を扱うフロントエンド向けAPI。
// 永続化は PersonalRepository (ScopeDevice) に委譲する。
type SettingsBinding struct {
	repo domain.PersonalRepository
}

func NewSettingsBinding(repo domain.PersonalRepository) *SettingsBinding {
	return &SettingsBinding{repo: repo}
}

// --- Help Tips ---

// GetHiddenTipKeys は非表示化されたヘルプ tip キーの一覧を返す。
func (b *SettingsBinding) GetHiddenTipKeys() ([]string, error) {
	return b.repo.GetHiddenTipKeys()
}

// SetTipHidden は指定キーの非表示状態を更新する。hidden=true で追加、false では現状何もしない（個別解除は未仕様）。
func (b *SettingsBinding) SetTipHidden(key string, hidden bool) error {
	if !hidden {
		return nil
	}
	return b.repo.AddHiddenTipKey(key)
}

// ResetHiddenTips は全ての非表示 tip キーを解除する。
func (b *SettingsBinding) ResetHiddenTips() error {
	return b.repo.ClearHiddenTipKeys()
}

// --- Locale ---

// GetLocale は保存済みのUI言語コードを返す（未設定時は空文字）。
func (b *SettingsBinding) GetLocale() (string, error) {
	return b.repo.GetLocale()
}

// SetLocale はUI言語コードを保存する。
func (b *SettingsBinding) SetLocale(locale string) error {
	return b.repo.SetLocale(locale)
}

// --- AreaDetailRadius ---

const defaultAreaDetailRadiusKm = 5.0

// GetAreaDetailRadiusKm は区域詳細編集モードの隣接半径(km)を返す。未設定時は既定値 5.0 を返す。
func (b *SettingsBinding) GetAreaDetailRadiusKm() (float64, error) {
	v, err := b.repo.GetAreaDetailRadiusKm()
	if err != nil {
		return 0, err
	}
	if v <= 0 {
		return defaultAreaDetailRadiusKm, nil
	}
	return v, nil
}

// SetAreaDetailRadiusKm は隣接半径(km)を保存する。
func (b *SettingsBinding) SetAreaDetailRadiusKm(km float64) error {
	return b.repo.SetAreaDetailRadiusKm(km)
}
