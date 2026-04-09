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
	// 論理削除: GetPlace は引き続き取得できる
	got, err := repo.GetPlace("p1")
	if err != nil {
		t.Fatalf("GetPlace after logical delete: %v", err)
	}
	if got.DeletedAt == nil {
		t.Error("DeletedAt should be set after delete")
	}
}

func TestPlace_DeleteNotFound(t *testing.T) {
	repo := newPlaceRepo()
	err := repo.DeletePlace("nonexistent")
	if err == nil {
		t.Fatal("expected error")
	}
}

// --- 論理削除と削除済み近傍検索 ---

func TestPlace_DeleteIsLogical(t *testing.T) {
	repo := newPlaceRepo()
	repo.SavePlace(&models.Place{
		ID: "p1", AreaID: "a1",
		Coord: models.Coordinate{Lat: 35.0, Lng: 140.0},
		Type:  models.PlaceTypeHouse,
	})
	if err := repo.DeletePlace("p1"); err != nil {
		t.Fatalf("DeletePlace: %v", err)
	}
	// アクティブ一覧からは消える
	active, _ := repo.ListPlaces("a1")
	if len(active) != 0 {
		t.Errorf("ListPlaces should exclude deleted, got %d", len(active))
	}
	// 物理的にはまだ存在し DeletedAt が立つ
	got, err := repo.GetPlace("p1")
	if err != nil {
		t.Fatalf("GetPlace after logical delete: %v", err)
	}
	if got.DeletedAt == nil {
		t.Error("DeletedAt should be set after delete")
	}
}

func TestPlace_ListDeletedNear(t *testing.T) {
	repo := newPlaceRepo()
	// p1: 削除済み・近い
	repo.SavePlace(&models.Place{
		ID: "p1", AreaID: "a1",
		Coord: models.Coordinate{Lat: 35.6810, Lng: 139.7670},
		Type:  models.PlaceTypeHouse,
	})
	repo.DeletePlace("p1")
	// p2: 削除済み・遠い (約100m離れる)
	repo.SavePlace(&models.Place{
		ID: "p2", AreaID: "a1",
		Coord: models.Coordinate{Lat: 35.6820, Lng: 139.7680},
		Type:  models.PlaceTypeHouse,
	})
	repo.DeletePlace("p2")
	// p3: アクティブ・近い (検索対象外: 削除済みのみ返す)
	repo.SavePlace(&models.Place{
		ID: "p3", AreaID: "a1",
		Coord: models.Coordinate{Lat: 35.6810, Lng: 139.7670},
		Type:  models.PlaceTypeHouse,
	})

	list, err := repo.ListDeletedPlacesNear(35.6810, 139.7670, 5.0)
	if err != nil {
		t.Fatalf("ListDeletedPlacesNear: %v", err)
	}
	if len(list) != 1 {
		t.Fatalf("got %d, want 1 (only p1 within 5m)", len(list))
	}
	if list[0].ID != "p1" {
		t.Errorf("expected p1, got %s", list[0].ID)
	}
}

func TestPlace_RestoredFromID(t *testing.T) {
	repo := newPlaceRepo()
	old := "old-place-id"
	p := &models.Place{
		ID: "p-new", AreaID: "a1",
		Coord:          models.Coordinate{Lat: 35.0, Lng: 140.0},
		Type:           models.PlaceTypeHouse,
		RestoredFromID: &old,
	}
	if err := repo.SavePlace(p); err != nil {
		t.Fatalf("SavePlace: %v", err)
	}
	got, _ := repo.GetPlace("p-new")
	if got.RestoredFromID == nil || *got.RestoredFromID != old {
		t.Errorf("RestoredFromID not preserved")
	}
}
