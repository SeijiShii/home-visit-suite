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

// --- SchedulePeriod ---

func TestSchedulePeriod_SaveAndList(t *testing.T) {
	repo := newCoverageRepo()
	now := time.Now()
	repo.SaveSchedulePeriod(&models.SchedulePeriod{ID: "sp1", Name: "春活動", StartDate: now, EndDate: now.Add(30 * 24 * time.Hour)})
	repo.SaveSchedulePeriod(&models.SchedulePeriod{ID: "sp2", Name: "夏活動", StartDate: now.Add(60 * 24 * time.Hour), EndDate: now.Add(90 * 24 * time.Hour)})

	list, err := repo.ListSchedulePeriods()
	if err != nil {
		t.Fatalf("ListSchedulePeriods error: %v", err)
	}
	if len(list) != 2 {
		t.Errorf("got %d, want 2", len(list))
	}
}

func TestSchedulePeriod_Get(t *testing.T) {
	repo := newCoverageRepo()
	now := time.Now()
	repo.SaveSchedulePeriod(&models.SchedulePeriod{ID: "sp1", Name: "春活動", StartDate: now, EndDate: now.Add(90 * 24 * time.Hour), Approved: true})

	got, err := repo.GetSchedulePeriod("sp1")
	if err != nil {
		t.Fatalf("GetSchedulePeriod error: %v", err)
	}
	if got.ID != "sp1" {
		t.Errorf("ID = %q, want sp1", got.ID)
	}
	if got.Name != "春活動" {
		t.Errorf("Name = %q, want 春活動", got.Name)
	}
	if !got.Approved {
		t.Error("Approved should be true")
	}
}

func TestSchedulePeriod_GetNotFound(t *testing.T) {
	repo := newCoverageRepo()
	_, err := repo.GetSchedulePeriod("nonexistent")
	if err == nil {
		t.Error("GetSchedulePeriod with unknown id should return error")
	}
}

func TestSchedulePeriod_SaveOverwrite(t *testing.T) {
	repo := newCoverageRepo()
	now := time.Now()
	repo.SaveSchedulePeriod(&models.SchedulePeriod{ID: "sp1", Name: "旧名", StartDate: now, EndDate: now.Add(30 * 24 * time.Hour)})
	repo.SaveSchedulePeriod(&models.SchedulePeriod{ID: "sp1", Name: "新名", StartDate: now, EndDate: now.Add(60 * 24 * time.Hour), Approved: true})

	got, _ := repo.GetSchedulePeriod("sp1")
	if got.Name != "新名" {
		t.Errorf("Name = %q, want 新名 after overwrite", got.Name)
	}
	if !got.Approved {
		t.Error("Approved should be true after overwrite")
	}

	list, _ := repo.ListSchedulePeriods()
	if len(list) != 1 {
		t.Errorf("list len = %d, want 1 (overwrite should not duplicate)", len(list))
	}
}

func TestSchedulePeriod_Delete(t *testing.T) {
	repo := newCoverageRepo()
	now := time.Now()
	repo.SaveSchedulePeriod(&models.SchedulePeriod{ID: "sp1", Name: "春活動", StartDate: now, EndDate: now.Add(90 * 24 * time.Hour)})

	err := repo.DeleteSchedulePeriod("sp1")
	if err != nil {
		t.Fatalf("DeleteSchedulePeriod error: %v", err)
	}

	_, err = repo.GetSchedulePeriod("sp1")
	if err == nil {
		t.Error("GetSchedulePeriod after delete should return error")
	}
}

func TestSchedulePeriod_DeleteNotFound(t *testing.T) {
	repo := newCoverageRepo()
	err := repo.DeleteSchedulePeriod("nonexistent")
	if err == nil {
		t.Error("DeleteSchedulePeriod with unknown id should return error")
	}
}

func TestSchedulePeriod_ListEmpty(t *testing.T) {
	repo := newCoverageRepo()
	list, err := repo.ListSchedulePeriods()
	if err != nil {
		t.Fatalf("ListSchedulePeriods error: %v", err)
	}
	if len(list) != 0 {
		t.Errorf("got %d, want 0 for empty repo", len(list))
	}
}

// --- Scope ---

func TestScope_SaveAndList(t *testing.T) {
	repo := newCoverageRepo()
	repo.SaveScope(&models.Scope{ID: "sc1", SchedulePeriodID: "sp1", Name: "グループA", GroupID: "grp-a", ParentAreaIDs: []string{"pa-1"}})
	repo.SaveScope(&models.Scope{ID: "sc2", SchedulePeriodID: "sp1", Name: "休日活動", GroupID: "", ParentAreaIDs: []string{"pa-2"}})
	repo.SaveScope(&models.Scope{ID: "sc3", SchedulePeriodID: "sp2", Name: "グループB", GroupID: "grp-b", ParentAreaIDs: []string{"pa-3"}})

	list, err := repo.ListScopes("sp1")
	if err != nil {
		t.Fatalf("ListScopes error: %v", err)
	}
	if len(list) != 2 {
		t.Errorf("got %d, want 2", len(list))
	}
}

func TestScope_ListAll(t *testing.T) {
	repo := newCoverageRepo()
	now := time.Now()
	repo.SaveScope(&models.Scope{ID: "sc1", SchedulePeriodID: "sp1", GroupID: "g1", ParentAreaIDs: []string{"pa1"}, CreatedAt: now, UpdatedAt: now})
	repo.SaveScope(&models.Scope{ID: "sc2", SchedulePeriodID: "sp1", GroupID: "g2", ParentAreaIDs: []string{"pa2"}, CreatedAt: now, UpdatedAt: now})
	repo.SaveScope(&models.Scope{ID: "sc3", SchedulePeriodID: "sp2", GroupID: "g1", ParentAreaIDs: []string{"pa3"}, CreatedAt: now, UpdatedAt: now})

	list, err := repo.ListAllScopes()
	if err != nil {
		t.Fatalf("ListAllScopes error: %v", err)
	}
	if len(list) != 3 {
		t.Errorf("got %d, want 3", len(list))
	}
}

func TestScope_ListAll_Empty(t *testing.T) {
	repo := newCoverageRepo()
	list, err := repo.ListAllScopes()
	if err != nil {
		t.Fatalf("ListAllScopes error: %v", err)
	}
	if len(list) != 0 {
		t.Errorf("got %d, want 0 for empty repo", len(list))
	}
}

func TestScope_Get(t *testing.T) {
	repo := newCoverageRepo()
	now := time.Now()
	repo.SaveScope(&models.Scope{ID: "sc1", SchedulePeriodID: "sp1", Name: "グループA", GroupID: "g1", ParentAreaIDs: []string{"pa1", "pa2"}, CreatedAt: now, UpdatedAt: now})

	got, err := repo.GetScope("sc1")
	if err != nil {
		t.Fatalf("GetScope error: %v", err)
	}
	if got.ID != "sc1" {
		t.Errorf("ID = %q, want sc1", got.ID)
	}
	if got.SchedulePeriodID != "sp1" {
		t.Errorf("SchedulePeriodID = %q, want sp1", got.SchedulePeriodID)
	}
	if len(got.ParentAreaIDs) != 2 {
		t.Errorf("ParentAreaIDs len = %d, want 2", len(got.ParentAreaIDs))
	}
}

func TestScope_GetNotFound(t *testing.T) {
	repo := newCoverageRepo()
	_, err := repo.GetScope("nonexistent")
	if err == nil {
		t.Error("GetScope with unknown id should return error")
	}
}

func TestScope_SaveOverwrite(t *testing.T) {
	repo := newCoverageRepo()
	now := time.Now()
	repo.SaveScope(&models.Scope{ID: "sc1", SchedulePeriodID: "sp1", Name: "旧名", GroupID: "g1", ParentAreaIDs: []string{"pa1"}, CreatedAt: now, UpdatedAt: now})
	repo.SaveScope(&models.Scope{ID: "sc1", SchedulePeriodID: "sp1", Name: "新名", GroupID: "g1", ParentAreaIDs: []string{"pa1", "pa2"}, CreatedAt: now, UpdatedAt: now})

	got, _ := repo.GetScope("sc1")
	if got.Name != "新名" {
		t.Errorf("Name = %q, want 新名 after overwrite", got.Name)
	}
	if len(got.ParentAreaIDs) != 2 {
		t.Errorf("ParentAreaIDs len = %d, want 2 after overwrite", len(got.ParentAreaIDs))
	}

	list, _ := repo.ListAllScopes()
	if len(list) != 1 {
		t.Errorf("list len = %d, want 1 (overwrite should not duplicate)", len(list))
	}
}

func TestScope_Delete(t *testing.T) {
	repo := newCoverageRepo()
	now := time.Now()
	repo.SaveScope(&models.Scope{ID: "sc1", SchedulePeriodID: "sp1", GroupID: "g1", ParentAreaIDs: []string{"pa1"}, CreatedAt: now, UpdatedAt: now})

	err := repo.DeleteScope("sc1")
	if err != nil {
		t.Fatalf("DeleteScope error: %v", err)
	}

	_, err = repo.GetScope("sc1")
	if err == nil {
		t.Error("GetScope after delete should return error")
	}
}

func TestScope_DeleteNotFound(t *testing.T) {
	repo := newCoverageRepo()
	err := repo.DeleteScope("nonexistent")
	if err == nil {
		t.Error("DeleteScope with unknown id should return error")
	}
}

func TestScope_ListScopes_EmptyWhenNoneForPeriod(t *testing.T) {
	repo := newCoverageRepo()
	now := time.Now()
	repo.SaveScope(&models.Scope{ID: "sc1", SchedulePeriodID: "sp1", GroupID: "g1", ParentAreaIDs: []string{"pa1"}, CreatedAt: now, UpdatedAt: now})

	list, err := repo.ListScopes("sp2")
	if err != nil {
		t.Fatalf("ListScopes error: %v", err)
	}
	if len(list) != 0 {
		t.Errorf("got %d, want 0 for unknown period", len(list))
	}
}

func TestScope_ParentAreaIDs_IsolatedCopy(t *testing.T) {
	// Saveで渡したスライスを後から変更しても保存済みデータに影響しないこと
	repo := newCoverageRepo()
	now := time.Now()
	ids := []string{"pa1", "pa2"}
	repo.SaveScope(&models.Scope{ID: "sc1", SchedulePeriodID: "sp1", GroupID: "g1", ParentAreaIDs: ids, CreatedAt: now, UpdatedAt: now})
	ids[0] = "MUTATED"

	got, _ := repo.GetScope("sc1")
	if got.ParentAreaIDs[0] == "MUTATED" {
		t.Error("SaveScope should store an isolated copy of ParentAreaIDs")
	}
}

func TestScope_ParentAreaIDs_GetReturnsCopy(t *testing.T) {
	// Getで取得したスライスを変更しても保存済みデータに影響しないこと
	repo := newCoverageRepo()
	now := time.Now()
	repo.SaveScope(&models.Scope{ID: "sc1", SchedulePeriodID: "sp1", GroupID: "g1", ParentAreaIDs: []string{"pa1", "pa2"}, CreatedAt: now, UpdatedAt: now})

	got, _ := repo.GetScope("sc1")
	got.ParentAreaIDs[0] = "MUTATED"

	got2, _ := repo.GetScope("sc1")
	if got2.ParentAreaIDs[0] == "MUTATED" {
		t.Error("GetScope should return an isolated copy of ParentAreaIDs")
	}
}

func TestScope_MultiplePeriodsIsolated(t *testing.T) {
	// 異なるSchedulePeriodのScopeがListScopesで混在しないこと
	repo := newCoverageRepo()
	now := time.Now()
	repo.SaveScope(&models.Scope{ID: "sc1", SchedulePeriodID: "sp1", GroupID: "g1", ParentAreaIDs: []string{"pa1"}, CreatedAt: now, UpdatedAt: now})
	repo.SaveScope(&models.Scope{ID: "sc2", SchedulePeriodID: "sp2", GroupID: "g1", ParentAreaIDs: []string{"pa2"}, CreatedAt: now, UpdatedAt: now})
	repo.SaveScope(&models.Scope{ID: "sc3", SchedulePeriodID: "sp2", GroupID: "g2", ParentAreaIDs: []string{"pa3"}, CreatedAt: now, UpdatedAt: now})

	sp1List, _ := repo.ListScopes("sp1")
	if len(sp1List) != 1 {
		t.Errorf("sp1 got %d, want 1", len(sp1List))
	}

	sp2List, _ := repo.ListScopes("sp2")
	if len(sp2List) != 2 {
		t.Errorf("sp2 got %d, want 2", len(sp2List))
	}

	allList, _ := repo.ListAllScopes()
	if len(allList) != 3 {
		t.Errorf("all got %d, want 3", len(allList))
	}
}

// --- AreaAvailability ---

func TestAreaAvailability_SaveAndList(t *testing.T) {
	repo := newCoverageRepo()
	repo.SaveAreaAvailability(&models.AreaAvailability{ID: "aa1", ScopeID: "sc1", AreaID: "a1", Type: models.AvailabilityLendable})
	repo.SaveAreaAvailability(&models.AreaAvailability{ID: "aa2", ScopeID: "sc1", AreaID: "a2", Type: models.AvailabilitySelfTake})
	repo.SaveAreaAvailability(&models.AreaAvailability{ID: "aa3", ScopeID: "sc2", AreaID: "a1", Type: models.AvailabilityLendable})

	list, err := repo.ListAreaAvailabilities("sc1")
	if err != nil {
		t.Fatalf("ListAreaAvailabilities error: %v", err)
	}
	if len(list) != 2 {
		t.Errorf("got %d, want 2", len(list))
	}
}

func TestAreaAvailability_DeleteNotFound(t *testing.T) {
	repo := newCoverageRepo()
	err := repo.DeleteAreaAvailability("nonexistent")
	if err == nil {
		t.Error("DeleteAreaAvailability with unknown id should return error")
	}
}

func TestAreaAvailability_DeleteAndGone(t *testing.T) {
	repo := newCoverageRepo()
	repo.SaveAreaAvailability(&models.AreaAvailability{ID: "aa1", ScopeID: "sc1", AreaID: "a1", Type: models.AvailabilityLendable})

	err := repo.DeleteAreaAvailability("aa1")
	if err != nil {
		t.Fatalf("DeleteAreaAvailability error: %v", err)
	}

	list, _ := repo.ListAreaAvailabilities("sc1")
	if len(list) != 0 {
		t.Errorf("got %d, want 0 after delete", len(list))
	}
}
