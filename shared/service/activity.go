package service

import (
	"time"

	"github.com/SeijiShii/home-visit-suite/shared/domain/models"
)

// ActivityService は訪問活動の管理ロジック。
type ActivityService interface {
	// Checkout は区域をチェックアウト（貸し出し）する。
	// 排他的貸出: 同一区域にアクティブなActivityがあればエラー。
	// checkoutType=lending: editor+のみ実行可能、lentByIDにactorIDを設定。
	// checkoutType=self_take: memberも実行可能、ownerIDにactorIDを設定。
	Checkout(actorID string, areaID string, checkoutType models.CheckoutType, ownerID string) (*models.Activity, error)

	// Return は区域を返却する。担当者またはチームメンバーが実行可能。
	Return(actorID string, activityID string) error

	// ForceReturn は編集メンバーが強制回収する。editor+のみ。
	ForceReturn(actorID string, activityID string) error

	// RecordVisit は訪問記録を作成する。activity staffが実行。
	// applicationText: 申請を伴うステータス（vacant_abandoned / refused）の場合は必須、
	// それ以外は無視される。
	// 申請が必要なステータスでは Request も同時に作成し、AppliedRequestID で紐付ける。
	RecordVisit(actorID string, activityID string, placeID string, result models.VisitResult, visitedAt time.Time, applicationText string) (*models.VisitRecord, error)

	// RecordVisitAdHoc は活動セッション (Activity) に紐付かない訪問記録を作成する。
	// チェックアウトモデルが未配線の Phase 1 暫定 API。
	// areaID は記録対象の区域 ID を直接指定する。Activity を参照しないため Status チェック等は行わない。
	// 仕様 docs/wants/08_活動メンバー向けアプリ.md「訪問記録画面 > 起動後の遷移」
	// 本番モデル（チェックアウト → Activity → 返却）配線完了時に削除する。
	RecordVisitAdHoc(actorID string, areaID string, placeID string, result models.VisitResult, visitedAt time.Time, applicationText string) (*models.VisitRecord, error)

	// AssignTeam は訪問活動にチームを割り当てる。
	AssignTeam(actorID string, activityID, teamID string, activityDate time.Time) error
}
