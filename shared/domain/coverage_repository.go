package domain

import "github.com/SeijiShii/home-visit-suite/shared/domain/models"

// CoverageRepository は網羅活動関連データの永続化インターフェース。
type CoverageRepository interface {
	// Coverage
	ListCoverages(parentAreaID string) ([]models.Coverage, error)
	GetCoverage(id string) (*models.Coverage, error)
	SaveCoverage(c *models.Coverage) error
	DeleteCoverage(id string) error

	// CoveragePlan
	ListCoveragePlans(coverageID string) ([]models.CoveragePlan, error)
	GetCoveragePlan(id string) (*models.CoveragePlan, error)
	SaveCoveragePlan(cp *models.CoveragePlan) error
	DeleteCoveragePlan(id string) error

	// AreaAvailability
	ListAreaAvailabilities(coveragePlanID string) ([]models.AreaAvailability, error)
	SaveAreaAvailability(aa *models.AreaAvailability) error
	DeleteAreaAvailability(id string) error
}
