package domain

import (
	"time"

	"github.com/SeijiShii/home-visit-suite/shared/domain/models"
)

// CoverageRepository は網羅活動関連データの永続化インターフェース。
type CoverageRepository interface {
	// Coverage
	ListCoverages(parentAreaID string) ([]models.Coverage, error)
	GetCoverage(id string) (*models.Coverage, error)
	SaveCoverage(c *models.Coverage) error
	DeleteCoverage(id string) error

	// AvailablePeriod（チェックアウト可能期間、SchedulePeriod の後継）
	ListAvailablePeriods() ([]models.AvailablePeriod, error)
	GetAvailablePeriod(id string) (*models.AvailablePeriod, error)
	GetActiveAvailablePeriod(now time.Time) (*models.AvailablePeriod, error) // 重複不可制約により最大1件、なければ (nil, nil)
	SaveAvailablePeriod(p *models.AvailablePeriod) error
	DeleteAvailablePeriod(id string) error

	// AvailablePeriodTag（AvailablePeriod 専用タグ、メンバータグとは別概念）
	ListAvailablePeriodTags() ([]models.AvailablePeriodTag, error)
	GetAvailablePeriodTag(id string) (*models.AvailablePeriodTag, error)
	SaveAvailablePeriodTag(t *models.AvailablePeriodTag) error
	DeleteAvailablePeriodTag(id string) error
}
