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

	// ReassignOwner はチェックアウトの担当者を別メンバーへ任命変更する。editor+のみ。
	// active 状態のチェックアウトでのみ実行可能。
	// 紐づく未失効の区域招待・LentByID は維持される（仕様: 担当者変更とアクセス権・履歴は独立）。
	// newOwnerID が現担当者と同じ場合は冪等な成功を返す（no-op）。
	// 仕様 docs/wants/05_チェックアウト.md「担当者」「区域招待 > 担当者変更時の招待の扱い」
	ReassignOwner(actorID string, checkoutID string, newOwnerID string) error

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

	// AreaAccessMode は userID が areaID に対して持つ区域レベルのアクセスモードを返す。
	//   - editor+ ならば常に閲覧可。入力可（editable）になるのは active なチェックアウト経由のみ
	//   - 活動メンバーは担当者または有効招待保有のときのみ editable、それ以外は read_only
	// 仕様 docs/wants/05_チェックアウト.md「アクセスモード > 区域レベル（親レイヤー）」
	AreaAccessMode(userID string, areaID string) (models.AccessMode, error)

	// PlaceAccessMode は userID が placeID に対して持つ場所レベルのアクセスモードを返す。
	// 現フェーズでは場所単位の read-only 切替操作は未実装のため、常に editable を返す。
	// 仕様 docs/wants/05_チェックアウト.md「アクセスモード > 場所レベル（子レイヤー）」
	PlaceAccessMode(userID string, placeID string) (models.AccessMode, error)

	// ListAccessibleAreas は userID がアクセス可能な区域一覧を返す。
	// 担当者として active なチェックアウトを持つ区域 + 有効な招待を保有している区域。
	// 仕様 docs/wants/10_画面設計.md「ダッシュボード > アクセス可能な区域」
	ListAccessibleAreas(userID string) ([]AccessibleArea, error)
}

// AccessibleAreaRole は ListAccessibleAreas が返す区域への自分の関与種別。
type AccessibleAreaRole string

const (
	AccessibleAreaRoleOwner   AccessibleAreaRole = "owner"   // 自分が担当者
	AccessibleAreaRoleInvitee AccessibleAreaRole = "invitee" // 自分が被招待者
)

// AccessibleArea は ListAccessibleAreas のレスポンス DTO。
// 各エントリは1つのチェックアウトとそれに対する自分の関与を表す。
type AccessibleArea struct {
	AreaID          string             `json:"areaId"`
	CheckoutID      string             `json:"checkoutId"`
	Role            AccessibleAreaRole `json:"role"`
	InviteExpiresAt *time.Time         `json:"inviteExpiresAt"` // Role==invitee のとき、招待の期限
}
