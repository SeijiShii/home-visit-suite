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

	// ForceReturn は編集スタッフが強制回収する。editor+のみ。
	ForceReturn(actorID string, activityID string) error

	// RecordVisit は訪問記録を作成する。activity staffが実行。
	RecordVisit(actorID string, activityID string, placeID string, result models.VisitResult, visitedAt time.Time) (*models.VisitRecord, error)

	// AssignTeam は訪問活動にチームを割り当てる。
	AssignTeam(actorID string, activityID, teamID string, activityDate time.Time) error
}
