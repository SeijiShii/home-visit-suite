package repository_test

import (
	"testing"
	"time"

	"github.com/SeijiShii/home-visit-suite/shared/domain/models"
	"github.com/SeijiShii/home-visit-suite/shared/domain/repository"
)

func newCoverageRepo() *repository.InMemoryCoverageRepository {
	return repository.NewInMemoryCoverageRepository()
}

func TestCoverage_SaveAndList(t *testing.T) {
	repo := newCoverageRepo()
	repo.SaveCoverage(&models.Coverage{ID: "c1", ParentAreaID: "pa1", Status: models.CoverageStatusActive})
	repo.SaveCoverage(&models.Coverage{ID: "c2", ParentAreaID: "pa1", Status: models.CoverageStatusPlanned})
	repo.SaveCoverage(&models.Coverage{ID: "c3", ParentAreaID: "pa2", Status: models.CoverageStatusActive})

	list, _ := repo.ListCoverages("pa1")
	if len(list) != 2 {
		t.Errorf("got %d, want 2", len(list))
	}
}

func TestCoveragePlan_SaveAndList(t *testing.T) {
	repo := newCoverageRepo()
	now := time.Now()
	repo.SaveCoveragePlan(&models.CoveragePlan{ID: "cp1", CoverageID: "c1", StartDate: now, EndDate: now.Add(30 * 24 * time.Hour)})
	repo.SaveCoveragePlan(&models.CoveragePlan{ID: "cp2", CoverageID: "c1", StartDate: now, EndDate: now.Add(60 * 24 * time.Hour)})
	repo.SaveCoveragePlan(&models.CoveragePlan{ID: "cp3", CoverageID: "c2", StartDate: now, EndDate: now.Add(30 * 24 * time.Hour)})

	list, _ := repo.ListCoveragePlans("c1")
	if len(list) != 2 {
		t.Errorf("got %d, want 2", len(list))
	}
}

func TestAreaAvailability_SaveAndList(t *testing.T) {
	repo := newCoverageRepo()
	repo.SaveAreaAvailability(&models.AreaAvailability{ID: "aa1", CoveragePlanID: "cp1", AreaID: "a1", Type: models.AvailabilityLendable})
	repo.SaveAreaAvailability(&models.AreaAvailability{ID: "aa2", CoveragePlanID: "cp1", AreaID: "a2", Type: models.AvailabilitySelfTake})
	repo.SaveAreaAvailability(&models.AreaAvailability{ID: "aa3", CoveragePlanID: "cp2", AreaID: "a1", Type: models.AvailabilityLendable})

	list, _ := repo.ListAreaAvailabilities("cp1")
	if len(list) != 2 {
		t.Errorf("got %d, want 2", len(list))
	}
}
