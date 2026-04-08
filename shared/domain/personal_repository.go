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

	// AppSettings (key-value)

	// GetHiddenTipKeys は非表示化されたヘルプ tip キーの一覧を返す。
	// 初期状態では空配列を返し、エラーにはしない。
	GetHiddenTipKeys() ([]string, error)
	// AddHiddenTipKey は指定キーを非表示リストに追加する。既に存在する場合は何もしない。
	AddHiddenTipKey(key string) error
	// ClearHiddenTipKeys は非表示リストを全消去する。
	ClearHiddenTipKeys() error

	// GetLocale は保存済みの UI 言語コード ("ja"/"en" 等) を返す。未設定の場合は空文字。
	GetLocale() (string, error)
	// SetLocale は UI 言語コードを保存する。
	SetLocale(locale string) error
}
