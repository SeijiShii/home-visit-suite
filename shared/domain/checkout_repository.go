package domain

import "github.com/SeijiShii/home-visit-suite/shared/domain/models"

// CheckoutRepository はチェックアウト関連データの永続化インターフェース。
type CheckoutRepository interface {
	// Checkout
	ListCheckouts(areaID string) ([]models.Checkout, error)
	GetCheckout(id string) (*models.Checkout, error)
	GetActiveCheckout(areaID string) (*models.Checkout, error)                  // 排他的貸出: アクティブなチェックアウトを取得
	ListActiveCheckoutsForOwner(ownerID string) ([]models.Checkout, error)      // 担当者として持つアクティブなチェックアウト（ダッシュボード「アクセス可能な区域」用）
	SaveCheckout(checkout *models.Checkout) error
	DeleteCheckout(id string) error

	// CheckoutInvitation（区域招待）
	GetCheckoutInvitation(id string) (*models.CheckoutInvitation, error)
	GetCheckoutInvitationByPair(checkoutID, inviteeID string) (*models.CheckoutInvitation, error) // 同一被招待者重複検出（上書き延長用）
	ListCheckoutInvitations(checkoutID string) ([]models.CheckoutInvitation, error)
	ListActiveCheckoutInvitationsForInvitee(inviteeID string) ([]models.CheckoutInvitation, error) // 被招待者のアクセス可能区域算出用（取消済み除外。期限切れフィルタは呼び出し側）
	SaveCheckoutInvitation(inv *models.CheckoutInvitation) error

	// VisitRecord
	ListVisitRecords(areaID string) ([]models.VisitRecord, error)
	ListVisitRecordsByPlace(placeID string) ([]models.VisitRecord, error)           // 場所単位の全ネットワーク訪問記録（最近会えた日付の集計用）
	ListMyVisitRecordsByPlace(placeID, userID string) ([]models.VisitRecord, error) // 場所単位の個人訪問履歴
	GetVisitRecord(id string) (*models.VisitRecord, error)
	SaveVisitRecord(vr *models.VisitRecord) error
	DeleteVisitRecord(id string) error

	// VisitRecordEdit
	ListVisitRecordEdits(visitRecordID string) ([]models.VisitRecordEdit, error)
	SaveVisitRecordEdit(edit *models.VisitRecordEdit) error
}
