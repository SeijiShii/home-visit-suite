package repository_test

import (
	"testing"

	"github.com/SeijiShii/home-visit-suite/shared/domain/models"
	"github.com/SeijiShii/home-visit-suite/shared/domain/repository"
)

func newPlaceRepo() *repository.InMemoryPlaceRepository {
	return repository.NewInMemoryPlaceRepository()
}

func TestPlace_SaveAndGet(t *testing.T) {
	repo := newPlaceRepo()
	p := &models.Place{ID: "p1", AreaID: "area-1", Type: models.PlaceTypeHouse, Label: "田中"}
	if err := repo.SavePlace(p); err != nil {
		t.Fatalf("SavePlace: %v", err)
	}
	got, err := repo.GetPlace("p1")
	if err != nil {
		t.Fatalf("GetPlace: %v", err)
	}
	if got.Label != "田中" {
		t.Errorf("Label = %q, want 田中", got.Label)
	}
}

func TestPlace_ListByArea(t *testing.T) {
	repo := newPlaceRepo()
	repo.SavePlace(&models.Place{ID: "p1", AreaID: "area-1", Type: models.PlaceTypeHouse})
	repo.SavePlace(&models.Place{ID: "p2", AreaID: "area-1", Type: models.PlaceTypeBuilding})
	repo.SavePlace(&models.Place{ID: "p3", AreaID: "area-2", Type: models.PlaceTypeHouse})

	list, err := repo.ListPlaces("area-1")
	if err != nil {
		t.Fatalf("ListPlaces: %v", err)
	}
	if len(list) != 2 {
		t.Errorf("got %d, want 2", len(list))
	}
}

func TestPlace_SortOrder(t *testing.T) {
	repo := newPlaceRepo()
	repo.SavePlace(&models.Place{ID: "p1", AreaID: "a1", SortOrder: 3})
	repo.SavePlace(&models.Place{ID: "p2", AreaID: "a1", SortOrder: 1})
	repo.SavePlace(&models.Place{ID: "p3", AreaID: "a1", SortOrder: 2})

	list, _ := repo.ListPlaces("a1")
	if len(list) != 3 {
		t.Fatalf("got %d, want 3", len(list))
	}
	if list[0].ID != "p2" || list[1].ID != "p3" || list[2].ID != "p1" {
		t.Errorf("sort order wrong: %s, %s, %s", list[0].ID, list[1].ID, list[2].ID)
	}
}

func TestPlace_Delete(t *testing.T) {
	repo := newPlaceRepo()
	repo.SavePlace(&models.Place{ID: "p1", AreaID: "area-1"})
	if err := repo.DeletePlace("p1"); err != nil {
		t.Fatalf("DeletePlace: %v", err)
	}
	_, err := repo.GetPlace("p1")
	if err == nil {
		t.Fatal("expected error after delete")
	}
}

func TestPlace_DeleteNotFound(t *testing.T) {
	repo := newPlaceRepo()
	err := repo.DeletePlace("nonexistent")
	if err == nil {
		t.Fatal("expected error")
	}
}
