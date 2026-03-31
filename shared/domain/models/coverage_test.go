package models_test

import (
	"testing"
	"time"

	"github.com/SeijiShii/home-visit-suite/shared/domain/models"
)

func TestSchedulePeriod_Fields(t *testing.T) {
	now := time.Now()
	sp := models.SchedulePeriod{
		ID:        "sp-1",
		Name:      "2026年春活動",
		StartDate: now,
		EndDate:   now.Add(30 * 24 * time.Hour),
		Approved:  true,
		CreatedAt: now,
		UpdatedAt: now,
	}

	if sp.ID != "sp-1" {
		t.Errorf("ID = %q, want sp-1", sp.ID)
	}
	if sp.Name != "2026年春活動" {
		t.Errorf("Name = %q, want 2026年春活動", sp.Name)
	}
	if !sp.Approved {
		t.Error("Approved should be true")
	}
	if sp.StartDate.IsZero() {
		t.Error("StartDate should not be zero")
	}
	if sp.EndDate.IsZero() {
		t.Error("EndDate should not be zero")
	}
	if sp.CreatedAt.IsZero() {
		t.Error("CreatedAt should not be zero")
	}
	if sp.UpdatedAt.IsZero() {
		t.Error("UpdatedAt should not be zero")
	}
}

func TestScope_Fields(t *testing.T) {
	now := time.Now()
	sc := models.Scope{
		ID:               "sc-1",
		SchedulePeriodID: "sp-1",
		Name:             "休日活動",
		GroupID:          "",
		ParentAreaIDs:    []string{"pa-1", "pa-2", "pa-3"},
		CreatedAt:        now,
		UpdatedAt:        now,
	}

	if sc.ID != "sc-1" {
		t.Errorf("ID = %q, want sc-1", sc.ID)
	}
	if sc.SchedulePeriodID != "sp-1" {
		t.Errorf("SchedulePeriodID = %q, want sp-1", sc.SchedulePeriodID)
	}
	if sc.Name != "休日活動" {
		t.Errorf("Name = %q, want 休日活動", sc.Name)
	}
	if len(sc.ParentAreaIDs) != 3 {
		t.Errorf("ParentAreaIDs len = %d, want 3", len(sc.ParentAreaIDs))
	}
	if sc.ParentAreaIDs[0] != "pa-1" {
		t.Errorf("ParentAreaIDs[0] = %q, want pa-1", sc.ParentAreaIDs[0])
	}
	if sc.CreatedAt.IsZero() {
		t.Error("CreatedAt should not be zero")
	}
	if sc.UpdatedAt.IsZero() {
		t.Error("UpdatedAt should not be zero")
	}
}

func TestScope_GroupScope(t *testing.T) {
	// グループスコープ: メンバーグループからコピーされ GroupID が設定される
	sc := models.Scope{
		ID:               "sc-2",
		SchedulePeriodID: "sp-1",
		Name:             "グループA",
		GroupID:          "group-a",
		ParentAreaIDs:    []string{"pa-10", "pa-11"},
	}

	if sc.GroupID == "" {
		t.Error("GroupID should be non-empty for group scope")
	}
	if sc.GroupID != "group-a" {
		t.Errorf("GroupID = %q, want group-a", sc.GroupID)
	}
	if sc.Name != "グループA" {
		t.Errorf("Name = %q, want グループA (copied from group name)", sc.Name)
	}
}

func TestScope_NonGroupScope(t *testing.T) {
	// 非グループスコープ: GroupID は空、名称は自由定義
	sc := models.Scope{
		ID:               "sc-3",
		SchedulePeriodID: "sp-1",
		Name:             "集合住宅メイン",
		GroupID:          "",
		ParentAreaIDs:    []string{"pa-20"},
	}

	if sc.GroupID != "" {
		t.Errorf("GroupID = %q, want empty for non-group scope", sc.GroupID)
	}
	if sc.Name != "集合住宅メイン" {
		t.Errorf("Name = %q, want 集合住宅メイン", sc.Name)
	}
}

func TestCoverageStatus_Values(t *testing.T) {
	tests := []struct {
		s    models.CoverageStatus
		want string
	}{
		{models.CoverageStatusPlanned, "planned"},
		{models.CoverageStatusActive, "active"},
		{models.CoverageStatusCompleted, "completed"},
	}
	for _, tt := range tests {
		if string(tt.s) != tt.want {
			t.Errorf("CoverageStatus = %q, want %q", tt.s, tt.want)
		}
	}
}
