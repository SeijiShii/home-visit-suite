package service

import (
	"time"

	"github.com/SeijiShii/home-visit-suite/shared/domain/models"
)

// CheckoutService はチェックアウトの管理ロジック。
type CheckoutService interface {
	// Checkout は区域をチェックアウト（貸し出し）する。
	// 排他的貸出: 同一区域にアクティブなチェックアウトがあればエラー。
	// checkoutType=lending: editor+のみ実行可能、lentByIDにactorIDを設定。
	// checkoutType=self_take: memberも実行可能、ownerIDにactorIDを設定。
	Checkout(actorID string, areaID string, checkoutType models.CheckoutType, ownerID string) (*models.Checkout, error)

	// Return は区域を返却する。担当者または編集メンバー以上が実行可能。
	// 紐づく未失効の区域招待は連動失効する。
	Return(actorID string, checkoutID string) error

	// ForceReturn は編集メンバーが強制回収する。editor+のみ。
	// 紐づく未失効の区域招待は連動失効する。
	ForceReturn(actorID string, checkoutID string) error

	// RecordVisit は訪問記録を作成する。チェックアウトの担当者または有効な招待保有者が実行。
	// applicationText: 申請を伴うステータス（vacant_abandoned / refused）の場合は必須、
	// それ以外は無視される。
	// 申請が必要なステータスでは Request も同時に作成し、AppliedRequestID で紐付ける。
	RecordVisit(actorID string, checkoutID string, placeID string, result models.VisitResult, visitedAt time.Time, applicationText string) (*models.VisitRecord, error)

	// RecordVisitAdHoc はチェックアウトに紐付かない訪問記録を作成する。
	// チェックアウトモデルが未配線の Phase 1 暫定 API。
	// areaID は記録対象の区域 ID を直接指定する。チェックアウトを参照しないため Status チェック等は行わない。
	// 仕様 docs/wants/08_活動メンバー向けアプリ.md「訪問記録画面 > 起動後の遷移」
	// 本番モデル（チェックアウト → 訪問記録 → 返却）配線完了時に削除する。
	RecordVisitAdHoc(actorID string, areaID string, placeID string, result models.VisitResult, visitedAt time.Time, applicationText string) (*models.VisitRecord, error)

	// Invite は区域招待を発行する。
	//   - actorID は editor+ または当該チェックアウトの現担当者
	//   - チェックアウトは active 状態であること
	//   - inviteeID は活動メンバー（member）かつ担当者本人ではない
	//   - ttl が 0 ならデフォルト 24 時間を適用、負値はエラー
	//   - 既存の有効な招待があれば ExpiresAt を上書き延長する（重複レコードは作らない）
	//   - 発行成功時、被招待者へ NotificationTypeAreaInvite 通知を送る（発行時のみ通知）
	// 仕様 docs/wants/05_チェックアウト.md「区域招待」
	Invite(actorID string, checkoutID string, inviteeID string, ttl time.Duration) (*models.CheckoutInvitation, error)

	// RevokeInvite は区域招待を取り消す。
	//   - 取消可能者: 招待者本人 / 当該チェックアウトの現担当者 / editor+
	//   - 既に取消済みの場合はエラー（ErrInvalidState）
	// 仕様 docs/wants/05_チェックアウト.md「区域招待 > 失効・取り消し」
	RevokeInvite(actorID string, invitationID string) error

	// ListInvitations は当該チェックアウトの招待一覧を返す（取消・期限切れ含む全件）。
	ListInvitations(checkoutID string) ([]models.CheckoutInvitation, error)
}
