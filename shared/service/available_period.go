package service

import (
	"time"

	"github.com/SeijiShii/home-visit-suite/shared/domain/models"
)

// AvailablePeriodService はチェックアウト可能期間（AvailablePeriod）の管理ロジック。
// 仕様 docs/wants/06_網羅管理.md「チェックアウト可能期間（AvailablePeriod）」
type AvailablePeriodService interface {
	// CreatePeriod は新規 AvailablePeriod を作成する（editor+）。
	//   - 開始日・終了日のバリデーション（model.Validate）
	//   - 他の AvailablePeriod と時間的に重複してはいけない（重複不可制約、Q5）
	CreatePeriod(actorID string, name string, startDate, endDate time.Time, parentAreaIDs, tagIDs []string) (*models.AvailablePeriod, error)

	// UpdatePeriod は既存 AvailablePeriod を編集する（editor+、段階的ロック）。
	//   - 開始前: 全項目編集可
	//   - 活動中: 終了日 **延長** のみ／対象区域親番 **追加** のみ／タグ
	//   - 終了後: タグのみ
	UpdatePeriod(actorID string, periodID string, update PeriodUpdate) (*models.AvailablePeriod, error)

	// DeletePeriod は AvailablePeriod を削除する（editor+、開始前のみ可）。
	DeletePeriod(actorID string, periodID string) error

	// ListPeriods は全 AvailablePeriod を返す。
	ListPeriods() ([]models.AvailablePeriod, error)

	// GetPeriod は指定 ID の AvailablePeriod を返す。
	GetPeriod(id string) (*models.AvailablePeriod, error)

	// GetActivePeriod は now 時点でアクティブな AvailablePeriod を返す。なければ (nil, nil)。
	GetActivePeriod(now time.Time) (*models.AvailablePeriod, error)

	// ForceCloseExpiredCheckouts は now 時点で endDate を超えた AvailablePeriod 配下の
	// 未完了（pending / active）チェックアウトをすべて強制クローズ状態に遷移させる。
	// 紐づく未失効の招待もすべて失効する。
	// 戻り値: クローズしたチェックアウト数
	ForceCloseExpiredCheckouts(now time.Time) (int, error)

	// --- AvailablePeriodTag ---

	CreateTag(actorID string, name string, color string) (*models.AvailablePeriodTag, error)
	UpdateTag(actorID string, tagID string, name string, color string) (*models.AvailablePeriodTag, error)
	DeleteTag(actorID string, tagID string) error
	ListTags() ([]models.AvailablePeriodTag, error)
}

// PeriodUpdate は UpdatePeriod のパラメータ。nil フィールドは無変更を意味する。
type PeriodUpdate struct {
	Name          *string
	StartDate     *time.Time
	EndDate       *time.Time
	ParentAreaIDs *[]string
	TagIDs        *[]string
}
