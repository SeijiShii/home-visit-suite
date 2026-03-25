package domain

import "github.com/SeijiShii/home-visit-suite/shared/domain/models"

// PersonalRepository は個人データ（DeviceDB格納）の永続化インターフェース。
type PersonalRepository interface {
	// PersonalNote
	GetPersonalNote(visitRecordID string) (*models.PersonalNote, error)
	SavePersonalNote(note *models.PersonalNote) error
	DeletePersonalNote(id string) error

	// PersonalTag
	ListPersonalTags() ([]models.PersonalTag, error)
	SavePersonalTag(tag *models.PersonalTag) error
	DeletePersonalTag(id string) error

	// PersonalTagAssignment
	ListPersonalTagAssignments(visitRecordID string) ([]models.PersonalTagAssignment, error)
	SavePersonalTagAssignment(a *models.PersonalTagAssignment) error
	DeletePersonalTagAssignment(id string) error
}
