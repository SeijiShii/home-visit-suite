package models_test

import (
	"testing"
	"time"

	"github.com/SeijiShii/home-visit-suite/shared/domain/models"
)

func TestVisitRecordEdit_Fields(t *testing.T) {
	now := time.Now()
	edit := models.VisitRecordEdit{
		ID:            "vre-1",
		VisitRecordID: "vr-1",
		EditorID:      "did:key:editor1",
		OldBody:       `{"result":"absent"}`,
		NewBody:       `{"result":"met"}`,
		EditedAt:      now,
	}

	if edit.VisitRecordID != "vr-1" {
		t.Errorf("VisitRecordID = %q, want vr-1", edit.VisitRecordID)
	}
	if edit.EditorID != "did:key:editor1" {
		t.Errorf("EditorID = %q, want did:key:editor1", edit.EditorID)
	}
	if edit.OldBody != `{"result":"absent"}` {
		t.Errorf("OldBody = %q, unexpected", edit.OldBody)
	}
	if edit.NewBody != `{"result":"met"}` {
		t.Errorf("NewBody = %q, unexpected", edit.NewBody)
	}
	if !edit.EditedAt.Equal(now) {
		t.Errorf("EditedAt = %v, want %v", edit.EditedAt, now)
	}
}
