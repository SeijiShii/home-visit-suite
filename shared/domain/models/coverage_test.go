package models_test

import (
	"testing"
	"time"

	"github.com/SeijiShii/home-visit-suite/shared/domain/models"
)

func TestCoveragePlan_NewFields(t *testing.T) {
	now := time.Now()
	cp := models.CoveragePlan{
		ID:            "cp-1",
		CoverageID:    "cov-1",
		GroupID:       "group-a",
		ParentAreaIDs: []string{"pa-1", "pa-2", "pa-3"},
		StartDate:     now,
		EndDate:       now.Add(30 * 24 * time.Hour),
		Approved:      false,
		CreatedAt:     now,
		UpdatedAt:     now,
	}

	if len(cp.ParentAreaIDs) != 3 {
		t.Errorf("ParentAreaIDs len = %d, want 3", len(cp.ParentAreaIDs))
	}
	if cp.ParentAreaIDs[0] != "pa-1" {
		t.Errorf("ParentAreaIDs[0] = %q, want pa-1", cp.ParentAreaIDs[0])
	}
	if cp.CreatedAt.IsZero() {
		t.Error("CreatedAt should not be zero")
	}
	if cp.UpdatedAt.IsZero() {
		t.Error("UpdatedAt should not be zero")
	}
}

func TestCoveragePlan_AllMembers(t *testing.T) {
	cp := models.CoveragePlan{
		ID:         "cp-2",
		CoverageID: "cov-1",
		GroupID:    "", // 全メンバー対象
	}

	if cp.GroupID != "" {
		t.Errorf("GroupID = %q, want empty (all members)", cp.GroupID)
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
