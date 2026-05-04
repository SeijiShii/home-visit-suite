package binding

import (
	"time"

	"github.com/SeijiShii/home-visit-suite/shared/domain"
	"github.com/SeijiShii/home-visit-suite/shared/domain/models"
	"github.com/SeijiShii/home-visit-suite/shared/service"
)

// CheckoutBinding はチェックアウト管理画面・ダッシュボード・招待 UI のフロントエンド向け API。
// 仕様 docs/wants/05_チェックアウト.md, docs/wants/10_画面設計.md
type CheckoutBinding struct {
	repo domain.CheckoutRepository
	svc  service.CheckoutService
}

func NewCheckoutBinding(repo domain.CheckoutRepository, svc service.CheckoutService) *CheckoutBinding {
	return &CheckoutBinding{repo: repo, svc: svc}
}

// --- チェックアウト操作 ---

// Checkout は区域をチェックアウトする。
// checkoutType は "lending" または "self_take"。
// 編集メンバー以上が自分自身に貸し出す場合は actorID == ownerID で呼び出す（OwnerID == LentByID になる）。
func (b *CheckoutBinding) Checkout(actorID, areaID, checkoutType, ownerID string) (*models.Checkout, error) {
	return b.svc.Checkout(actorID, areaID, models.CheckoutType(checkoutType), ownerID)
}

// Return は担当者または編集メンバーがチェックアウトを返却する。
// 紐づく未失効の招待は連動失効する。
func (b *CheckoutBinding) Return(actorID, checkoutID string) error {
	return b.svc.Return(actorID, checkoutID)
}

// ForceReturn は編集メンバーが強制回収する。editor+ のみ。
// 紐づく未失効の招待は連動失効する。
func (b *CheckoutBinding) ForceReturn(actorID, checkoutID string) error {
	return b.svc.ForceReturn(actorID, checkoutID)
}

// ReassignOwner は担当者を別メンバーへ任命変更する。editor+ のみ。
// 既存招待は維持される（仕様 Q2）。
func (b *CheckoutBinding) ReassignOwner(actorID, checkoutID, newOwnerID string) error {
	return b.svc.ReassignOwner(actorID, checkoutID, newOwnerID)
}

// --- 区域招待 ---

// Invite は区域招待を発行する。
// ttlHours が 0 ならサービス層のデフォルト（24時間）が適用される。
// 同一被招待者への重複招待は ExpiresAt 上書き延長として扱う。
func (b *CheckoutBinding) Invite(actorID, checkoutID, inviteeID string, ttlHours int) (*models.CheckoutInvitation, error) {
	var ttl time.Duration
	if ttlHours > 0 {
		ttl = time.Duration(ttlHours) * time.Hour
	}
	return b.svc.Invite(actorID, checkoutID, inviteeID, ttl)
}

// RevokeInvite は区域招待を取り消す。
// 取消可能者: 招待者本人 / 当該チェックアウトの現担当者 / 編集メンバー以上。
func (b *CheckoutBinding) RevokeInvite(actorID, invitationID string) error {
	return b.svc.RevokeInvite(actorID, invitationID)
}

// ListInvitations は当該チェックアウトの招待一覧を返す（取消・期限切れ含む全件）。
func (b *CheckoutBinding) ListInvitations(checkoutID string) ([]models.CheckoutInvitation, error) {
	return b.svc.ListInvitations(checkoutID)
}

// --- チェックアウト一覧・取得 ---

// ListCheckouts は指定区域のチェックアウト履歴を返す（管理画面 /checkouts 用）。
func (b *CheckoutBinding) ListCheckouts(areaID string) ([]models.Checkout, error) {
	return b.repo.ListCheckouts(areaID)
}

// GetCheckout は指定 ID のチェックアウトを取得する。
func (b *CheckoutBinding) GetCheckout(id string) (*models.Checkout, error) {
	return b.repo.GetCheckout(id)
}

// GetActiveCheckout は指定区域のアクティブなチェックアウトを返す（無ければ nil）。
func (b *CheckoutBinding) GetActiveCheckout(areaID string) (*models.Checkout, error) {
	c, err := b.repo.GetActiveCheckout(areaID)
	if err != nil {
		// 「アクティブなし」を nil で返す（エラーにしない）
		return nil, nil
	}
	return c, nil
}

// --- アクセスモード判定 / アクセス可能区域 ---

// AreaAccessMode は userID が areaID に対して持つ区域レベルのアクセスモードを返す。
// 戻り値は "editable" または "read_only"。
func (b *CheckoutBinding) AreaAccessMode(userID, areaID string) (string, error) {
	mode, err := b.svc.AreaAccessMode(userID, areaID)
	return string(mode), err
}

// PlaceAccessMode は userID が placeID に対して持つ場所レベルのアクセスモードを返す。
// 現フェーズでは常に "editable"。
func (b *CheckoutBinding) PlaceAccessMode(userID, placeID string) (string, error) {
	mode, err := b.svc.PlaceAccessMode(userID, placeID)
	return string(mode), err
}

// ListAccessibleAreas は userID がアクセス可能な区域一覧を返す（ダッシュボード用）。
func (b *CheckoutBinding) ListAccessibleAreas(userID string) ([]service.AccessibleArea, error) {
	return b.svc.ListAccessibleAreas(userID)
}
