package repository_test

import (
	"testing"
	"time"

	"github.com/SeijiShii/home-visit-suite/shared/domain/models"
	"github.com/SeijiShii/home-visit-suite/shared/domain/repository"
)

func newCheckoutRepo() *repository.InMemoryCheckoutRepository {
	return repository.NewInMemoryCheckoutRepository()
}

// --- Checkout ---

func TestCheckout_SaveAndGet(t *testing.T) {
	repo := newCheckoutRepo()
	c := &models.Checkout{
		ID:           "co-1",
		AreaID:       "area-1",
		CheckoutType: models.CheckoutTypeLending,
		OwnerID:      "did:key:owner",
		Status:       models.CheckoutStatusActive,
		CreatedAt:    time.Now(),
		UpdatedAt:    time.Now(),
	}
	if err := repo.SaveCheckout(c); err != nil {
		t.Fatalf("SaveCheckout: %v", err)
	}
	got, err := repo.GetCheckout("co-1")
	if err != nil {
		t.Fatalf("GetCheckout: %v", err)
	}
	if got.OwnerID != "did:key:owner" {
		t.Errorf("OwnerID = %q, want did:key:owner", got.OwnerID)
	}
}

func TestCheckout_GetNotFound(t *testing.T) {
	repo := newCheckoutRepo()
	_, err := repo.GetCheckout("nonexistent")
	if err == nil {
		t.Fatal("expected error")
	}
}

func TestCheckout_ListByArea(t *testing.T) {
	repo := newCheckoutRepo()
	repo.SaveCheckout(&models.Checkout{ID: "c1", AreaID: "area-1", Status: models.CheckoutStatusActive})
	repo.SaveCheckout(&models.Checkout{ID: "c2", AreaID: "area-1", Status: models.CheckoutStatusComplete})
	repo.SaveCheckout(&models.Checkout{ID: "c3", AreaID: "area-2", Status: models.CheckoutStatusActive})

	list, err := repo.ListCheckouts("area-1")
	if err != nil {
		t.Fatalf("ListCheckouts: %v", err)
	}
	if len(list) != 2 {
		t.Errorf("got %d, want 2", len(list))
	}
}

func TestCheckout_GetActive_ExclusiveLending(t *testing.T) {
	repo := newCheckoutRepo()
	repo.SaveCheckout(&models.Checkout{ID: "c1", AreaID: "area-1", Status: models.CheckoutStatusComplete})
	repo.SaveCheckout(&models.Checkout{ID: "c2", AreaID: "area-1", Status: models.CheckoutStatusActive})

	got, err := repo.GetActiveCheckout("area-1")
	if err != nil {
		t.Fatalf("GetActiveCheckout: %v", err)
	}
	if got.ID != "c2" {
		t.Errorf("got ID=%s, want c2", got.ID)
	}
}

func TestCheckout_GetActive_NoneActive(t *testing.T) {
	repo := newCheckoutRepo()
	repo.SaveCheckout(&models.Checkout{ID: "c1", AreaID: "area-1", Status: models.CheckoutStatusComplete})

	_, err := repo.GetActiveCheckout("area-1")
	if err == nil {
		t.Fatal("expected error when no active checkout")
	}
}

func TestCheckout_Delete(t *testing.T) {
	repo := newCheckoutRepo()
	repo.SaveCheckout(&models.Checkout{ID: "c1", AreaID: "area-1"})
	if err := repo.DeleteCheckout("c1"); err != nil {
		t.Fatalf("DeleteCheckout: %v", err)
	}
	_, err := repo.GetCheckout("c1")
	if err == nil {
		t.Fatal("expected error after delete")
	}
}

// --- VisitRecord ---

func TestVisitRecord_SaveAndList(t *testing.T) {
	repo := newCheckoutRepo()
	now := time.Now()
	repo.SaveVisitRecord(&models.VisitRecord{ID: "vr-1", AreaID: "area-1", CheckoutID: "c1", Result: models.VisitResultMet, VisitedAt: now})
	repo.SaveVisitRecord(&models.VisitRecord{ID: "vr-2", AreaID: "area-1", CheckoutID: "c1", Result: models.VisitResultAbsent, VisitedAt: now})
	repo.SaveVisitRecord(&models.VisitRecord{ID: "vr-3", AreaID: "area-2", CheckoutID: "c2", Result: models.VisitResultMet, VisitedAt: now})

	list, err := repo.ListVisitRecords("area-1")
	if err != nil {
		t.Fatalf("ListVisitRecords: %v", err)
	}
	if len(list) != 2 {
		t.Errorf("got %d, want 2", len(list))
	}
}

func TestVisitRecord_ListByPlaceAndUser(t *testing.T) {
	repo := newCheckoutRepo()
	now := time.Now()

	// place-1 への訪問: user-A が 3 件、user-B が 1 件
	// place-2 への訪問: user-A が 1 件
	for _, vr := range []*models.VisitRecord{
		{ID: "v1", PlaceID: "place-1", UserID: "user-A", AreaID: "area-1", CheckoutID: "c1", Result: models.VisitResultMet, VisitedAt: now.Add(-72 * time.Hour)},
		{ID: "v2", PlaceID: "place-1", UserID: "user-A", AreaID: "area-1", CheckoutID: "c1", Result: models.VisitResultAbsent, VisitedAt: now.Add(-48 * time.Hour)},
		{ID: "v3", PlaceID: "place-1", UserID: "user-A", AreaID: "area-1", CheckoutID: "c1", Result: models.VisitResultMet, VisitedAt: now.Add(-24 * time.Hour)},
		{ID: "v4", PlaceID: "place-1", UserID: "user-B", AreaID: "area-1", CheckoutID: "c2", Result: models.VisitResultMet, VisitedAt: now.Add(-12 * time.Hour)},
		{ID: "v5", PlaceID: "place-2", UserID: "user-A", AreaID: "area-1", CheckoutID: "c1", Result: models.VisitResultMet, VisitedAt: now},
	} {
		if err := repo.SaveVisitRecord(vr); err != nil {
			t.Fatalf("SaveVisitRecord: %v", err)
		}
	}

	// 全ネットワーク（place-1 への訪問は 4 件）
	all, err := repo.ListVisitRecordsByPlace("place-1")
	if err != nil {
		t.Fatalf("ListVisitRecordsByPlace: %v", err)
	}
	if len(all) != 4 {
		t.Errorf("ListVisitRecordsByPlace len = %d, want 4", len(all))
	}

	// 個人履歴（user-A の place-1 への訪問は 3 件）
	mine, err := repo.ListMyVisitRecordsByPlace("place-1", "user-A")
	if err != nil {
		t.Fatalf("ListMyVisitRecordsByPlace: %v", err)
	}
	if len(mine) != 3 {
		t.Errorf("ListMyVisitRecordsByPlace len = %d, want 3", len(mine))
	}

	// 該当なし
	none, err := repo.ListMyVisitRecordsByPlace("place-1", "user-Z")
	if err != nil {
		t.Fatalf("ListMyVisitRecordsByPlace empty: %v", err)
	}
	if len(none) != 0 {
		t.Errorf("ListMyVisitRecordsByPlace empty len = %d, want 0", len(none))
	}
}

func TestVisitRecord_AppliedRequestID_RoundTrip(t *testing.T) {
	repo := newCheckoutRepo()
	now := time.Now()
	reqID := "req-9"
	if err := repo.SaveVisitRecord(&models.VisitRecord{
		ID:               "vr-app",
		AreaID:           "area-1",
		CheckoutID:       "c1",
		PlaceID:          "place-1",
		Result:           models.VisitResultRefused,
		AppliedRequestID: &reqID,
		VisitedAt:        now,
	}); err != nil {
		t.Fatalf("SaveVisitRecord: %v", err)
	}

	got, err := repo.GetVisitRecord("vr-app")
	if err != nil {
		t.Fatalf("GetVisitRecord: %v", err)
	}
	if got.AppliedRequestID == nil || *got.AppliedRequestID != "req-9" {
		t.Errorf("AppliedRequestID = %v, want %q", got.AppliedRequestID, "req-9")
	}
	if got.Result != models.VisitResultRefused {
		t.Errorf("Result = %q, want refused", got.Result)
	}
}

// --- VisitRecordEdit ---

func TestVisitRecordEdit_SaveAndList(t *testing.T) {
	repo := newCheckoutRepo()
	repo.SaveVisitRecordEdit(&models.VisitRecordEdit{ID: "vre-1", VisitRecordID: "vr-1", EditorID: "u1", EditedAt: time.Now()})
	repo.SaveVisitRecordEdit(&models.VisitRecordEdit{ID: "vre-2", VisitRecordID: "vr-1", EditorID: "u2", EditedAt: time.Now()})
	repo.SaveVisitRecordEdit(&models.VisitRecordEdit{ID: "vre-3", VisitRecordID: "vr-2", EditorID: "u1", EditedAt: time.Now()})

	list, err := repo.ListVisitRecordEdits("vr-1")
	if err != nil {
		t.Fatalf("ListVisitRecordEdits: %v", err)
	}
	if len(list) != 2 {
		t.Errorf("got %d, want 2", len(list))
	}
}
