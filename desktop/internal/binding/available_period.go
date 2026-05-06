package binding

import (
	"time"

	"github.com/SeijiShii/home-visit-suite/shared/domain/models"
	"github.com/SeijiShii/home-visit-suite/shared/service"
)

// AvailablePeriodBinding はチェックアウト可能期間（AvailablePeriod）管理画面のフロントエンド向け API。
// 仕様 docs/wants/06_網羅管理.md「チェックアウト可能期間（AvailablePeriod）」
// /coverage 画面（AvailablePeriod 管理 + 進捗参照）から呼び出す。
type AvailablePeriodBinding struct {
	svc service.AvailablePeriodService
}

func NewAvailablePeriodBinding(svc service.AvailablePeriodService) *AvailablePeriodBinding {
	return &AvailablePeriodBinding{svc: svc}
}

// CreatePeriodInput は CreatePeriod の入力 DTO。
type CreatePeriodInput struct {
	Name          string    `json:"name"`
	StartDate     time.Time `json:"startDate"`
	EndDate       time.Time `json:"endDate"`
	ParentAreaIDs []string  `json:"parentAreaIds"`
	TagIDs        []string  `json:"tagIds"`
}

// UpdatePeriodInput は UpdatePeriod の入力 DTO。nil フィールドは無変更。
type UpdatePeriodInput struct {
	Name          *string    `json:"name,omitempty"`
	StartDate     *time.Time `json:"startDate,omitempty"`
	EndDate       *time.Time `json:"endDate,omitempty"`
	ParentAreaIDs *[]string  `json:"parentAreaIds,omitempty"`
	TagIDs        *[]string  `json:"tagIds,omitempty"`
}

// --- Period CRUD ---

func (b *AvailablePeriodBinding) ListPeriods() ([]models.AvailablePeriod, error) {
	return b.svc.ListPeriods()
}

func (b *AvailablePeriodBinding) GetPeriod(id string) (*models.AvailablePeriod, error) {
	return b.svc.GetPeriod(id)
}

// GetActivePeriod は now（サーバ時刻）でアクティブな期間を返す。なければ nil。
func (b *AvailablePeriodBinding) GetActivePeriod() (*models.AvailablePeriod, error) {
	return b.svc.GetActivePeriod(time.Now())
}

func (b *AvailablePeriodBinding) CreatePeriod(actorID string, in CreatePeriodInput) (*models.AvailablePeriod, error) {
	return b.svc.CreatePeriod(actorID, in.Name, in.StartDate, in.EndDate, in.ParentAreaIDs, in.TagIDs)
}

func (b *AvailablePeriodBinding) UpdatePeriod(actorID, periodID string, in UpdatePeriodInput) (*models.AvailablePeriod, error) {
	return b.svc.UpdatePeriod(actorID, periodID, service.PeriodUpdate{
		Name:          in.Name,
		StartDate:     in.StartDate,
		EndDate:       in.EndDate,
		ParentAreaIDs: in.ParentAreaIDs,
		TagIDs:        in.TagIDs,
	})
}

func (b *AvailablePeriodBinding) DeletePeriod(actorID, periodID string) error {
	return b.svc.DeletePeriod(actorID, periodID)
}

// --- Tag CRUD ---

func (b *AvailablePeriodBinding) ListTags() ([]models.AvailablePeriodTag, error) {
	return b.svc.ListTags()
}

func (b *AvailablePeriodBinding) CreateTag(actorID, name, color string) (*models.AvailablePeriodTag, error) {
	return b.svc.CreateTag(actorID, name, color)
}

func (b *AvailablePeriodBinding) UpdateTag(actorID, tagID, name, color string) (*models.AvailablePeriodTag, error) {
	return b.svc.UpdateTag(actorID, tagID, name, color)
}

func (b *AvailablePeriodBinding) DeleteTag(actorID, tagID string) error {
	return b.svc.DeleteTag(actorID, tagID)
}

// --- 強制クローズ ---

// ForceCloseExpired は期限切れ期間配下の未完了チェックアウトを強制クローズする。
// 起動時・定期処理・管理者の手動トリガーから呼び出される。
func (b *AvailablePeriodBinding) ForceCloseExpired() (int, error) {
	return b.svc.ForceCloseExpiredCheckouts(time.Now())
}
