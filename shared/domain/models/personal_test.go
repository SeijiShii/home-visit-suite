package models_test

import (
	"testing"
	"time"

	"github.com/SeijiShii/home-visit-suite/shared/domain/models"
)

// --- PersonalNote ---

func TestPersonalNote_Fields(t *testing.T) {
	now := time.Now()
	pn := models.PersonalNote{
		ID:            "pn-1",
		VisitRecordID: "vr-1",
		Note:          "インターホン故障の様子。裏口から声かけ。",
		CreatedAt:     now,
		UpdatedAt:     now,
	}

	if pn.VisitRecordID != "vr-1" {
		t.Errorf("VisitRecordID = %q, want vr-1", pn.VisitRecordID)
	}
	if pn.Note != "インターホン故障の様子。裏口から声かけ。" {
		t.Errorf("Note = %q, unexpected", pn.Note)
	}
	if !pn.CreatedAt.Equal(now) {
		t.Errorf("CreatedAt = %v, want %v", pn.CreatedAt, now)
	}
}

// --- PersonalTag ---

func TestPersonalTag_Fields(t *testing.T) {
	pt := models.PersonalTag{
		ID:   "ptag-1",
		Name: "要再訪問",
	}

	if pt.ID != "ptag-1" {
		t.Errorf("ID = %q, want ptag-1", pt.ID)
	}
	if pt.Name != "要再訪問" {
		t.Errorf("Name = %q, want 要再訪問", pt.Name)
	}
}

// --- PersonalTagAssignment ---

func TestPersonalTagAssignment_Fields(t *testing.T) {
	pta := models.PersonalTagAssignment{
		ID:            "pta-1",
		TagID:         "ptag-1",
		VisitRecordID: "vr-1",
	}

	if pta.TagID != "ptag-1" {
		t.Errorf("TagID = %q, want ptag-1", pta.TagID)
	}
	if pta.VisitRecordID != "vr-1" {
		t.Errorf("VisitRecordID = %q, want vr-1", pta.VisitRecordID)
	}
}
