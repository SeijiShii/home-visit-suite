package service

import "github.com/SeijiShii/home-visit-suite/shared/domain/models"

// ActivityService は訪問活動の管理ロジック。
type ActivityService interface {
	// Checkout は区域をチェックアウト（貸し出し）する。
	Checkout(actorID string, areaID string) (*models.Activity, error)

	// Return は区域を返却する。
	Return(actorID string, activityID string) error

	// ForceReturn は編集スタッフが強制回収する。
	ForceReturn(actorID string, activityID string) error

	// AssignTeam は訪問活動にチームを割り当てる。
	AssignTeam(actorID string, activityID, teamID string) error

	// Reassign は他のチームに割り当て直す。
	Reassign(actorID string, activityID, newTeamID string) error
}
