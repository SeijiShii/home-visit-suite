package repository_test

import (
	"testing"

	"github.com/SeijiShii/home-visit-suite/shared/domain/models"
	"github.com/SeijiShii/home-visit-suite/shared/domain/repository"
)

func newCoverageRepo() *repository.InMemoryCoverageRepository {
	return repository.NewInMemoryCoverageRepository()
}

// --- Coverage ---

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

func TestCoverage_GetAndDelete(t *testing.T) {
	repo := newCoverageRepo()
	repo.SaveCoverage(&models.Coverage{ID: "c1", ParentAreaID: "pa1", Status: models.CoverageStatusActive})

	got, err := repo.GetCoverage("c1")
	if err != nil {
		t.Fatalf("GetCoverage error: %v", err)
	}
	if got.ID != "c1" {
		t.Errorf("ID = %q, want c1", got.ID)
	}

	err = repo.DeleteCoverage("c1")
	if err != nil {
		t.Fatalf("DeleteCoverage error: %v", err)
	}

	_, err = repo.GetCoverage("c1")
	if err == nil {
		t.Error("GetCoverage after delete should return error")
	}
}

func TestCoverage_GetNotFound(t *testing.T) {
	repo := newCoverageRepo()
	_, err := repo.GetCoverage("nonexistent")
	if err == nil {
		t.Error("GetCoverage with unknown id should return error")
	}
}

func TestCoverage_DeleteNotFound(t *testing.T) {
	repo := newCoverageRepo()
	err := repo.DeleteCoverage("nonexistent")
	if err == nil {
		t.Error("DeleteCoverage with unknown id should return error")
	}
}
