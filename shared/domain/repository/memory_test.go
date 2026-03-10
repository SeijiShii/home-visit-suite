package repository_test

import (
	"testing"

	"github.com/SeijiShii/home-visit-suite/shared/domain"
	"github.com/SeijiShii/home-visit-suite/shared/domain/models"
	"github.com/SeijiShii/home-visit-suite/shared/domain/repository"
)

// newRepo はテスト用InMemoryRepositoryを生成する。
func newMemoryRepo() domain.RegionRepository {
	return repository.NewInMemoryRepository()
}

// --- Region ---

func TestRegion_SaveAndGet(t *testing.T) {
	repo := newMemoryRepo()
	r := &models.Region{ID: "r1", Name: "成田市", Symbol: "NRT"}

	if err := repo.SaveRegion(r); err != nil {
		t.Fatalf("SaveRegion: %v", err)
	}

	got, err := repo.GetRegion("r1")
	if err != nil {
		t.Fatalf("GetRegion: %v", err)
	}
	if got.Name != "成田市" || got.Symbol != "NRT" {
		t.Errorf("got %+v, want Name=成田市, Symbol=NRT", got)
	}
}

func TestRegion_GetNotFound(t *testing.T) {
	repo := newMemoryRepo()
	_, err := repo.GetRegion("nonexistent")
	if err == nil {
		t.Fatal("expected error for nonexistent region")
	}
}

func TestRegion_List(t *testing.T) {
	repo := newMemoryRepo()
	repo.SaveRegion(&models.Region{ID: "r1", Name: "成田市", Symbol: "NRT"})
	repo.SaveRegion(&models.Region{ID: "r2", Name: "富里市", Symbol: "TMS"})

	regions, err := repo.ListRegions()
	if err != nil {
		t.Fatalf("ListRegions: %v", err)
	}
	if len(regions) != 2 {
		t.Errorf("got %d regions, want 2", len(regions))
	}
}

func TestRegion_SaveOverwrite(t *testing.T) {
	repo := newMemoryRepo()
	repo.SaveRegion(&models.Region{ID: "r1", Name: "旧名", Symbol: "OLD"})
	repo.SaveRegion(&models.Region{ID: "r1", Name: "新名", Symbol: "NEW"})

	got, _ := repo.GetRegion("r1")
	if got.Name != "新名" {
		t.Errorf("got Name=%s, want 新名", got.Name)
	}

	regions, _ := repo.ListRegions()
	if len(regions) != 1 {
		t.Errorf("got %d regions, want 1 (overwrite, not duplicate)", len(regions))
	}
}

func TestRegion_Delete(t *testing.T) {
	repo := newMemoryRepo()
	repo.SaveRegion(&models.Region{ID: "r1", Name: "成田市", Symbol: "NRT"})

	if err := repo.DeleteRegion("r1"); err != nil {
		t.Fatalf("DeleteRegion: %v", err)
	}

	_, err := repo.GetRegion("r1")
	if err == nil {
		t.Fatal("expected error after delete")
	}
}

func TestRegion_DeleteNotFound(t *testing.T) {
	repo := newMemoryRepo()
	err := repo.DeleteRegion("nonexistent")
	if err == nil {
		t.Fatal("expected error for deleting nonexistent region")
	}
}

// --- ParentArea ---

func TestParentArea_SaveAndGet(t *testing.T) {
	repo := newMemoryRepo()
	pa := &models.ParentArea{ID: "pa1", RegionID: "r1", Number: "001", Name: "加良部1丁目"}

	if err := repo.SaveParentArea(pa); err != nil {
		t.Fatalf("SaveParentArea: %v", err)
	}

	got, err := repo.GetParentArea("pa1")
	if err != nil {
		t.Fatalf("GetParentArea: %v", err)
	}
	if got.Name != "加良部1丁目" {
		t.Errorf("got Name=%s, want 加良部1丁目", got.Name)
	}
}

func TestParentArea_ListByRegion(t *testing.T) {
	repo := newMemoryRepo()
	repo.SaveParentArea(&models.ParentArea{ID: "pa1", RegionID: "r1", Number: "001", Name: "加良部1"})
	repo.SaveParentArea(&models.ParentArea{ID: "pa2", RegionID: "r1", Number: "002", Name: "加良部2"})
	repo.SaveParentArea(&models.ParentArea{ID: "pa3", RegionID: "r2", Number: "001", Name: "七栄1"})

	list, err := repo.ListParentAreas("r1")
	if err != nil {
		t.Fatalf("ListParentAreas: %v", err)
	}
	if len(list) != 2 {
		t.Errorf("got %d parent areas for r1, want 2", len(list))
	}
}

func TestParentArea_Delete(t *testing.T) {
	repo := newMemoryRepo()
	repo.SaveParentArea(&models.ParentArea{ID: "pa1", RegionID: "r1", Number: "001", Name: "加良部1"})

	if err := repo.DeleteParentArea("pa1"); err != nil {
		t.Fatalf("DeleteParentArea: %v", err)
	}
	_, err := repo.GetParentArea("pa1")
	if err == nil {
		t.Fatal("expected error after delete")
	}
}

// --- Area ---

func TestArea_SaveAndGet(t *testing.T) {
	repo := newMemoryRepo()
	a := &models.Area{ID: "a1", ParentAreaID: "pa1", Number: "05"}

	if err := repo.SaveArea(a); err != nil {
		t.Fatalf("SaveArea: %v", err)
	}

	got, err := repo.GetArea("a1")
	if err != nil {
		t.Fatalf("GetArea: %v", err)
	}
	if got.Number != "05" {
		t.Errorf("got Number=%s, want 05", got.Number)
	}
}

func TestArea_ListByParentArea(t *testing.T) {
	repo := newMemoryRepo()
	repo.SaveArea(&models.Area{ID: "a1", ParentAreaID: "pa1", Number: "01"})
	repo.SaveArea(&models.Area{ID: "a2", ParentAreaID: "pa1", Number: "02"})
	repo.SaveArea(&models.Area{ID: "a3", ParentAreaID: "pa2", Number: "01"})

	list, err := repo.ListAreas("pa1")
	if err != nil {
		t.Fatalf("ListAreas: %v", err)
	}
	if len(list) != 2 {
		t.Errorf("got %d areas for pa1, want 2", len(list))
	}
}

func TestArea_Delete(t *testing.T) {
	repo := newMemoryRepo()
	repo.SaveArea(&models.Area{ID: "a1", ParentAreaID: "pa1", Number: "01"})

	if err := repo.DeleteArea("a1"); err != nil {
		t.Fatalf("DeleteArea: %v", err)
	}
	_, err := repo.GetArea("a1")
	if err == nil {
		t.Fatal("expected error after delete")
	}
}

func TestArea_DeleteNotFound(t *testing.T) {
	repo := newMemoryRepo()
	err := repo.DeleteArea("nonexistent")
	if err == nil {
		t.Fatal("expected error for deleting nonexistent area")
	}
}
