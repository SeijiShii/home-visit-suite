package domain

import "github.com/SeijiShii/home-visit-suite/shared/domain/models"

// CoverageRepository は網羅活動関連データの永続化インターフェース。
type CoverageRepository interface {
	// Coverage
	ListCoverages(parentAreaID string) ([]models.Coverage, error)
	GetCoverage(id string) (*models.Coverage, error)
	SaveCoverage(c *models.Coverage) error
	DeleteCoverage(id string) error

	// SchedulePeriod
	ListSchedulePeriods() ([]models.SchedulePeriod, error)
	GetSchedulePeriod(id string) (*models.SchedulePeriod, error)
	SaveSchedulePeriod(sp *models.SchedulePeriod) error
	DeleteSchedulePeriod(id string) error

	// Scope
	ListScopes(schedulePeriodID string) ([]models.Scope, error)
	ListAllScopes() ([]models.Scope, error)
	GetScope(id string) (*models.Scope, error)
	SaveScope(sc *models.Scope) error
	DeleteScope(id string) error

	// AreaAvailability
	ListAreaAvailabilities(scopeID string) ([]models.AreaAvailability, error)
	SaveAreaAvailability(aa *models.AreaAvailability) error
	DeleteAreaAvailability(id string) error
}
