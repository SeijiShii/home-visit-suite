package repository_test

import (
	"testing"
	"time"

	"github.com/SeijiShii/home-visit-suite/shared/domain/models"
)

func mkPeriod(id, name string, start, end time.Time, parentAreas, tags []string) *models.AvailablePeriod {
	return &models.AvailablePeriod{
		ID:            id,
		Name:          name,
		StartDate:     start,
		EndDate:       end,
		ParentAreaIDs: parentAreas,
		TagIDs:        tags,
		CreatedAt:     start,
		UpdatedAt:     start,
	}
}

func TestAvailablePeriod_SaveAndGet(t *testing.T) {
	repo := newCoverageRepo()
	now := time.Date(2026, 5, 1, 0, 0, 0, 0, time.UTC)
	p := mkPeriod("ap-1", "春期", now, now.AddDate(0, 1, 0), []string{"pa-1"}, []string{"apt-1"})

	if err := repo.SaveAvailablePeriod(p); err != nil {
		t.Fatalf("SaveAvailablePeriod error: %v", err)
	}

	got, err := repo.GetAvailablePeriod("ap-1")
	if err != nil {
		t.Fatalf("GetAvailablePeriod error: %v", err)
	}
	if got.Name != "春期" {
		t.Errorf("Name = %q, want 春期", got.Name)
	}
	if len(got.ParentAreaIDs) != 1 || got.ParentAreaIDs[0] != "pa-1" {
		t.Errorf("ParentAreaIDs = %v, want [pa-1]", got.ParentAreaIDs)
	}
	if len(got.TagIDs) != 1 || got.TagIDs[0] != "apt-1" {
		t.Errorf("TagIDs = %v, want [apt-1]", got.TagIDs)
	}
}

func TestAvailablePeriod_GetNotFound(t *testing.T) {
	repo := newCoverageRepo()
	if _, err := repo.GetAvailablePeriod("nope"); err == nil {
		t.Error("GetAvailablePeriod on missing id should error")
	}
}

func TestAvailablePeriod_List(t *testing.T) {
	repo := newCoverageRepo()
	t1 := time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC)
	t2 := time.Date(2026, 5, 1, 0, 0, 0, 0, time.UTC)
	repo.SaveAvailablePeriod(mkPeriod("ap-1", "冬期", t1, t1.AddDate(0, 1, 0), nil, nil))
	repo.SaveAvailablePeriod(mkPeriod("ap-2", "春期", t2, t2.AddDate(0, 1, 0), nil, nil))

	list, err := repo.ListAvailablePeriods()
	if err != nil {
		t.Fatalf("ListAvailablePeriods error: %v", err)
	}
	if len(list) != 2 {
		t.Errorf("got %d periods, want 2", len(list))
	}
}

func TestAvailablePeriod_Delete(t *testing.T) {
	repo := newCoverageRepo()
	now := time.Date(2026, 5, 1, 0, 0, 0, 0, time.UTC)
	repo.SaveAvailablePeriod(mkPeriod("ap-1", "春期", now, now.AddDate(0, 1, 0), nil, nil))

	if err := repo.DeleteAvailablePeriod("ap-1"); err != nil {
		t.Fatalf("DeleteAvailablePeriod error: %v", err)
	}
	if _, err := repo.GetAvailablePeriod("ap-1"); err == nil {
		t.Error("GetAvailablePeriod after delete should error")
	}
}

func TestAvailablePeriod_DeepCopy_Mutation(t *testing.T) {
	// 取得後にスライスを変更してもリポジトリ内のデータが汚染されないこと
	repo := newCoverageRepo()
	now := time.Date(2026, 5, 1, 0, 0, 0, 0, time.UTC)
	repo.SaveAvailablePeriod(mkPeriod("ap-1", "x", now, now.AddDate(0, 1, 0), []string{"pa-1"}, []string{"apt-1"}))

	got, _ := repo.GetAvailablePeriod("ap-1")
	got.ParentAreaIDs[0] = "MUTATED"
	got.TagIDs[0] = "MUTATED"

	again, _ := repo.GetAvailablePeriod("ap-1")
	if again.ParentAreaIDs[0] != "pa-1" {
		t.Errorf("ParentAreaIDs leaked mutation: %v", again.ParentAreaIDs)
	}
	if again.TagIDs[0] != "apt-1" {
		t.Errorf("TagIDs leaked mutation: %v", again.TagIDs)
	}
}

func TestAvailablePeriod_GetActive(t *testing.T) {
	repo := newCoverageRepo()
	now := time.Date(2026, 5, 15, 0, 0, 0, 0, time.UTC)

	repo.SaveAvailablePeriod(mkPeriod("ap-past", "past",
		time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC),
		time.Date(2026, 1, 31, 0, 0, 0, 0, time.UTC), nil, nil))
	repo.SaveAvailablePeriod(mkPeriod("ap-now", "now",
		time.Date(2026, 5, 1, 0, 0, 0, 0, time.UTC),
		time.Date(2026, 5, 31, 0, 0, 0, 0, time.UTC), nil, nil))
	repo.SaveAvailablePeriod(mkPeriod("ap-future", "future",
		time.Date(2026, 9, 1, 0, 0, 0, 0, time.UTC),
		time.Date(2026, 9, 30, 0, 0, 0, 0, time.UTC), nil, nil))

	got, err := repo.GetActiveAvailablePeriod(now)
	if err != nil {
		t.Fatalf("GetActiveAvailablePeriod error: %v", err)
	}
	if got == nil {
		t.Fatal("GetActiveAvailablePeriod = nil, want ap-now")
	}
	if got.ID != "ap-now" {
		t.Errorf("active ID = %q, want ap-now", got.ID)
	}
}

func TestAvailablePeriod_GetActive_None(t *testing.T) {
	repo := newCoverageRepo()
	now := time.Date(2026, 5, 15, 0, 0, 0, 0, time.UTC)

	repo.SaveAvailablePeriod(mkPeriod("ap-past", "past",
		time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC),
		time.Date(2026, 1, 31, 0, 0, 0, 0, time.UTC), nil, nil))

	got, err := repo.GetActiveAvailablePeriod(now)
	if err != nil {
		t.Fatalf("GetActiveAvailablePeriod error: %v", err)
	}
	if got != nil {
		t.Errorf("GetActiveAvailablePeriod = %v, want nil for cooldown period", got)
	}
}

// --- AvailablePeriodTag ---

func TestAvailablePeriodTag_SaveListGetDelete(t *testing.T) {
	repo := newCoverageRepo()
	repo.SaveAvailablePeriodTag(&models.AvailablePeriodTag{ID: "apt-1", Name: "春期", Color: "#3b82f6"})
	repo.SaveAvailablePeriodTag(&models.AvailablePeriodTag{ID: "apt-2", Name: "強化", Color: "#f97316"})

	list, err := repo.ListAvailablePeriodTags()
	if err != nil {
		t.Fatalf("ListAvailablePeriodTags error: %v", err)
	}
	if len(list) != 2 {
		t.Errorf("got %d tags, want 2", len(list))
	}

	got, err := repo.GetAvailablePeriodTag("apt-1")
	if err != nil {
		t.Fatalf("GetAvailablePeriodTag error: %v", err)
	}
	if got.Name != "春期" {
		t.Errorf("Name = %q, want 春期", got.Name)
	}

	if err := repo.DeleteAvailablePeriodTag("apt-1"); err != nil {
		t.Fatalf("DeleteAvailablePeriodTag error: %v", err)
	}
	if _, err := repo.GetAvailablePeriodTag("apt-1"); err == nil {
		t.Error("GetAvailablePeriodTag after delete should error")
	}
}
