package service

import "github.com/SeijiShii/home-visit-suite/shared/domain/models"

// SchedulePeriodService は予定期間・スコープの管理ロジック。
type SchedulePeriodService interface {
	// CreateSchedulePeriod は予定期間を作成する。
	// 既存期間と日程が重複する場合、または StartDate >= EndDate の場合はエラー。
	CreateSchedulePeriod(sp *models.SchedulePeriod) error

	// UpdateSchedulePeriod は予定期間を更新する。
	// 他の期間と日程が重複する場合、または StartDate >= EndDate の場合はエラー。
	UpdateSchedulePeriod(sp *models.SchedulePeriod) error

	// DeleteSchedulePeriod は予定期間を削除する。存在しない場合はエラー。
	DeleteSchedulePeriod(id string) error

	// ListSchedulePeriods は全予定期間を返す。
	ListSchedulePeriods() ([]models.SchedulePeriod, error)

	// GetSchedulePeriod は指定 ID の予定期間を返す。存在しない場合はエラー。
	GetSchedulePeriod(id string) (*models.SchedulePeriod, error)

	// CreateScope はスコープを作成する。
	// SchedulePeriodID が存在しない場合はエラー。
	// 同一予定期間内で ParentAreaID が重複する場合はエラー。
	CreateScope(s *models.Scope) error

	// UpdateScope はスコープを更新する。
	// 同一予定期間内で他スコープが使用中の ParentAreaID を追加しようとするとエラー。
	UpdateScope(s *models.Scope) error

	// DeleteScope はスコープを削除する。存在しない場合はエラー。
	DeleteScope(id string) error

	// ListScopes は指定した予定期間のスコープ一覧を返す。
	ListScopes(schedulePeriodID string) ([]models.Scope, error)

	// GetScope は指定 ID のスコープを返す。存在しない場合はエラー。
	GetScope(id string) (*models.Scope, error)
}
