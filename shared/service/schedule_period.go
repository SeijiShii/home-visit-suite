package service

import "github.com/SeijiShii/home-visit-suite/shared/domain/models"

// SchedulePeriodService は予定期間・スコープ・区域可用性の管理ロジック。
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

	// ApproveSchedulePeriod は予定期間を承認する（管理者のみ）。
	// 監査ログ (AuditActionApproval) を記録する。
	ApproveSchedulePeriod(actorID, id string) error

	// RevokeSchedulePeriodApproval は予定期間の承認を取り消す（管理者のみ）。
	RevokeSchedulePeriodApproval(actorID, id string) error

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

	// CreateScopesFromGroups は指定メンバーグループから 1:1 でスコープを生成する。
	// グループ名がそのままスコープ名になり、GroupID が設定される。
	// ParentAreaIDs は空で生成され、後から付与する。
	CreateScopesFromGroups(schedulePeriodID string, groupIDs []string) ([]models.Scope, error)

	// CreateAreaAvailability は区域可用性を作成する。
	// - Scope が存在すること
	// - StartDate < EndDate
	// - 期間が親 SchedulePeriod 期間内であること
	// - AreaID の親 ParentArea が Scope.ParentAreaIDs に含まれること
	// - Type=self_take の場合、同一 AreaID の lendable エントリが存在すること
	CreateAreaAvailability(aa *models.AreaAvailability) error

	// UpdateAreaAvailability は区域可用性を更新する。検証ルールは Create と同じ。
	UpdateAreaAvailability(aa *models.AreaAvailability) error

	// DeleteAreaAvailability は区域可用性を削除する。
	DeleteAreaAvailability(id string) error

	// ListAreaAvailabilities は指定スコープの区域可用性一覧を返す。
	ListAreaAvailabilities(scopeID string) ([]models.AreaAvailability, error)
}
