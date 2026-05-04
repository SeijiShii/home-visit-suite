package models_test

import (
	"testing"
	"time"

	"github.com/SeijiShii/home-visit-suite/shared/domain/models"
)

// --- Checkout ---

func TestCheckout_NewFields(t *testing.T) {
	now := time.Now()
	returned := now.Add(24 * time.Hour)
	completed := now.Add(48 * time.Hour)

	c := models.Checkout{
		ID:           "co-1",
		AreaID:       "area-1",
		ScopeID:      "sc-1",
		CheckoutType: models.CheckoutTypeLending,
		OwnerID:      "did:key:owner",
		LentByID:     "did:key:editor",
		Status:       models.CheckoutStatusActive,
		CreatedAt:    now,
		ReturnedAt:   &returned,
		CompletedAt:  &completed,
		UpdatedAt:    now,
	}

	if c.ScopeID != "sc-1" {
		t.Errorf("ScopeID = %q, want %q", c.ScopeID, "sc-1")
	}
	if c.CheckoutType != models.CheckoutTypeLending {
		t.Errorf("CheckoutType = %q, want %q", c.CheckoutType, models.CheckoutTypeLending)
	}
	if c.LentByID != "did:key:editor" {
		t.Errorf("LentByID = %q, want %q", c.LentByID, "did:key:editor")
	}
	if c.ReturnedAt == nil || !c.ReturnedAt.Equal(returned) {
		t.Errorf("ReturnedAt = %v, want %v", c.ReturnedAt, returned)
	}
	if c.CompletedAt == nil || !c.CompletedAt.Equal(completed) {
		t.Errorf("CompletedAt = %v, want %v", c.CompletedAt, completed)
	}
}

func TestCheckout_SelfTake_LentByIDEmpty(t *testing.T) {
	c := models.Checkout{
		ID:           "co-2",
		AreaID:       "area-1",
		CheckoutType: models.CheckoutTypeSelfTake,
		OwnerID:      "did:key:member",
		Status:       models.CheckoutStatusActive,
	}

	if c.LentByID != "" {
		t.Errorf("LentByID = %q, want empty for self_take", c.LentByID)
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

// --- VisitRecord ---

func TestVisitRecord_CheckoutID_NoteRemoved(t *testing.T) {
	vr := models.VisitRecord{
		ID:         "vr-1",
		UserID:     "did:key:member",
		PlaceID:    "place-1",
		AreaID:     "area-1",
		CheckoutID: "co-1",
		Result:     models.VisitResultMet,
		VisitedAt:  time.Now(),
		CreatedAt:  time.Now(),
		UpdatedAt:  time.Now(),
	}

	if vr.CheckoutID != "co-1" {
		t.Errorf("CheckoutID = %q, want %q", vr.CheckoutID, "co-1")
	}
}

func TestVisitResult_Values(t *testing.T) {
	tests := []struct {
		r    models.VisitResult
		want string
	}{
		{models.VisitResultMet, "met"},
		{models.VisitResultAbsent, "absent"},
		{models.VisitResultVacantPossible, "vacant_possible"},
		{models.VisitResultVacantAbandoned, "vacant_abandoned"},
		{models.VisitResultRefused, "refused"},
	}
	for _, tt := range tests {
		if string(tt.r) != tt.want {
			t.Errorf("VisitResult = %q, want %q", tt.r, tt.want)
		}
	}
}

func TestVisitRecord_AppliedRequestID(t *testing.T) {
	// 申請を伴うステータス選択時、AppliedRequestID で対応 Request を参照する
	reqID := "req-1"
	vr := models.VisitRecord{
		ID:               "vr-app-1",
		UserID:           "did:key:member",
		PlaceID:          "place-1",
		AreaID:           "area-1",
		CheckoutID:       "co-1",
		Result:           models.VisitResultRefused,
		AppliedRequestID: &reqID,
		VisitedAt:        time.Now(),
	}
	if vr.AppliedRequestID == nil || *vr.AppliedRequestID != "req-1" {
		t.Errorf("AppliedRequestID = %v, want %q", vr.AppliedRequestID, "req-1")
	}
}

func TestVisitRecord_AppliedRequestID_NilForNonApplication(t *testing.T) {
	// 申請不要なステータス（met/absent/vacant_possible）では AppliedRequestID は nil
	vr := models.VisitRecord{
		ID:        "vr-no-app",
		Result:    models.VisitResultMet,
		VisitedAt: time.Now(),
	}
	if vr.AppliedRequestID != nil {
		t.Errorf("AppliedRequestID = %v, want nil", vr.AppliedRequestID)
	}
}

func TestVisitResult_RequiresApplication(t *testing.T) {
	// 申請を伴うステータス（テキスト入力 → 編集メンバータスク化）
	tests := []struct {
		r    models.VisitResult
		want bool
	}{
		{models.VisitResultMet, false},
		{models.VisitResultAbsent, false},
		{models.VisitResultVacantPossible, false},
		{models.VisitResultVacantAbandoned, true},
		{models.VisitResultRefused, true},
	}
	for _, tt := range tests {
		if got := tt.r.RequiresApplication(); got != tt.want {
			t.Errorf("VisitResult(%q).RequiresApplication() = %v, want %v", tt.r, got, tt.want)
		}
	}
}

func TestCheckoutStatus_Values(t *testing.T) {
	statuses := []struct {
		s    models.CheckoutStatus
		want string
	}{
		{models.CheckoutStatusPending, "pending"},
		{models.CheckoutStatusActive, "active"},
		{models.CheckoutStatusReturned, "returned"},
		{models.CheckoutStatusComplete, "complete"},
	}
	for _, tt := range statuses {
		if string(tt.s) != tt.want {
			t.Errorf("CheckoutStatus = %q, want %q", tt.s, tt.want)
		}
	}
}
