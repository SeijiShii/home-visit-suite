package domain

import "github.com/SeijiShii/home-visit-suite/shared/domain/models"

// ActivityRepository は訪問活動関連データの永続化インターフェース。
type ActivityRepository interface {
	// Activity
	ListActivities(areaID string) ([]models.Activity, error)
	GetActivity(id string) (*models.Activity, error)
	GetActiveActivity(areaID string) (*models.Activity, error) // 排他的貸出: アクティブなActivityを取得
	SaveActivity(activity *models.Activity) error
	DeleteActivity(id string) error

	// Team
	ListTeams() ([]models.Team, error)
	GetTeam(id string) (*models.Team, error)
	SaveTeam(team *models.Team) error
	DeleteTeam(id string) error

	// ActivityTeamAssignment
	ListAssignments(activityID string) ([]models.ActivityTeamAssignment, error)
	SaveAssignment(a *models.ActivityTeamAssignment) error
	DeleteAssignment(id string) error

	// VisitRecord
	ListVisitRecords(areaID string) ([]models.VisitRecord, error)
	GetVisitRecord(id string) (*models.VisitRecord, error)
	SaveVisitRecord(vr *models.VisitRecord) error
	DeleteVisitRecord(id string) error

	// VisitRecordEdit
	ListVisitRecordEdits(visitRecordID string) ([]models.VisitRecordEdit, error)
	SaveVisitRecordEdit(edit *models.VisitRecordEdit) error
}
