package models_test

import (
	"testing"
	"time"

	"github.com/SeijiShii/home-visit-suite/shared/domain/models"
)

// --- Activity ---

func TestActivity_NewFields(t *testing.T) {
	now := time.Now()
	returned := now.Add(24 * time.Hour)
	completed := now.Add(48 * time.Hour)

	a := models.Activity{
		ID:           "act-1",
		AreaID:       "area-1",
		ScopeID:      "sc-1",
		CheckoutType: models.CheckoutTypeLending,
		OwnerID:      "did:key:owner",
		LentByID:     "did:key:editor",
		Status:       models.ActivityStatusActive,
		CreatedAt:    now,
		ReturnedAt:   &returned,
		CompletedAt:  &completed,
		UpdatedAt:    now,
	}

	if a.ScopeID != "sc-1" {
		t.Errorf("ScopeID = %q, want %q", a.ScopeID, "sc-1")
	}
	if a.CheckoutType != models.CheckoutTypeLending {
		t.Errorf("CheckoutType = %q, want %q", a.CheckoutType, models.CheckoutTypeLending)
	}
	if a.LentByID != "did:key:editor" {
		t.Errorf("LentByID = %q, want %q", a.LentByID, "did:key:editor")
	}
	if a.ReturnedAt == nil || !a.ReturnedAt.Equal(returned) {
		t.Errorf("ReturnedAt = %v, want %v", a.ReturnedAt, returned)
	}
	if a.CompletedAt == nil || !a.CompletedAt.Equal(completed) {
		t.Errorf("CompletedAt = %v, want %v", a.CompletedAt, completed)
	}
}

func TestActivity_SelfTake_LentByIDEmpty(t *testing.T) {
	a := models.Activity{
		ID:           "act-2",
		AreaID:       "area-1",
		CheckoutType: models.CheckoutTypeSelfTake,
		OwnerID:      "did:key:member",
		Status:       models.ActivityStatusActive,
	}

	if a.LentByID != "" {
		t.Errorf("LentByID = %q, want empty for self_take", a.LentByID)
	}
}

func TestCheckoutType_Values(t *testing.T) {
	if string(models.CheckoutTypeLending) != "lending" {
		t.Errorf("CheckoutTypeLending = %q, want lending", models.CheckoutTypeLending)
	}
	if string(models.CheckoutTypeSelfTake) != "self_take" {
		t.Errorf("CheckoutTypeSelfTake = %q, want self_take", models.CheckoutTypeSelfTake)
	}
}

// --- ActivityTeamAssignment ---

func TestActivityTeamAssignment_ActivityDate(t *testing.T) {
	date := time.Date(2026, 3, 25, 0, 0, 0, 0, time.UTC)
	ata := models.ActivityTeamAssignment{
		ID:           "ata-1",
		ActivityID:   "act-1",
		TeamID:       "team-1",
		ActivityDate: date,
		AssignedAt:   time.Now(),
	}

	if !ata.ActivityDate.Equal(date) {
		t.Errorf("ActivityDate = %v, want %v", ata.ActivityDate, date)
	}
}

// --- VisitRecord ---

func TestVisitRecord_ActivityID_NoteRemoved(t *testing.T) {
	vr := models.VisitRecord{
		ID:         "vr-1",
		UserID:     "did:key:member",
		PlaceID:    "place-1",
		AreaID:     "area-1",
		ActivityID: "act-1",
		Result:     models.VisitResultMet,
		VisitedAt:  time.Now(),
		CreatedAt:  time.Now(),
		UpdatedAt:  time.Now(),
	}

	if vr.ActivityID != "act-1" {
		t.Errorf("ActivityID = %q, want %q", vr.ActivityID, "act-1")
	}
}

func TestVisitResult_Values(t *testing.T) {
	if string(models.VisitResultMet) != "met" {
		t.Errorf("VisitResultMet = %q, want met", models.VisitResultMet)
	}
	if string(models.VisitResultAbsent) != "absent" {
		t.Errorf("VisitResultAbsent = %q, want absent", models.VisitResultAbsent)
	}
}

func TestActivityStatus_Values(t *testing.T) {
	statuses := []struct {
		s    models.ActivityStatus
		want string
	}{
		{models.ActivityStatusPending, "pending"},
		{models.ActivityStatusActive, "active"},
		{models.ActivityStatusReturned, "returned"},
		{models.ActivityStatusComplete, "complete"},
	}
	for _, tt := range statuses {
		if string(tt.s) != tt.want {
			t.Errorf("ActivityStatus = %q, want %q", tt.s, tt.want)
		}
	}
}
