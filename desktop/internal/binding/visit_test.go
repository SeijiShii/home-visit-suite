package binding_test

import (
	"testing"
	"time"

	"github.com/SeijiShii/home-visit-suite/desktop/internal/binding"
	"github.com/SeijiShii/home-visit-suite/shared/domain/models"
	"github.com/SeijiShii/home-visit-suite/shared/domain/repository"
	"github.com/SeijiShii/home-visit-suite/shared/service"
)

// setupVisitBinding は VisitBinding と関連リポジトリを構築する。
// User-A は member ロール、A-1 はアクティブな Activity。
func setupVisitBinding(t *testing.T) (*binding.VisitBinding, *repository.InMemoryActivityRepository) {
	t.Helper()
	actRepo := repository.NewInMemoryActivityRepository()
	userRepo := repository.NewInMemoryUserRepository()
	userRepo.SaveUser(&models.User{ID: "user-A", Name: "A", Role: models.RoleMember})
	actRepo.SaveActivity(&models.Activity{
		ID: "act-1", AreaID: "area-1", OwnerID: "user-A",
		Status: models.ActivityStatusActive, CreatedAt: time.Now(),
	})

	notifRepo := repository.NewInMemoryNotificationRepository()
	svc := service.NewActivityService(actRepo, userRepo, notifRepo)
	return binding.NewVisitBinding(actRepo, svc), actRepo
}

func TestVisitBinding_RecordVisit_Met(t *testing.T) {
	b, repo := setupVisitBinding(t)

	now := time.Now()
	vr, err := b.RecordVisit("user-A", "act-1", "place-1", models.VisitResultMet, now, "")
	if err != nil {
		t.Fatalf("RecordVisit: %v", err)
	}
	if vr.Result != models.VisitResultMet {
		t.Errorf("Result = %q, want met", vr.Result)
	}
	if vr.PlaceID != "place-1" {
		t.Errorf("PlaceID = %q, want place-1", vr.PlaceID)
	}

	stored, _ := repo.GetVisitRecord(vr.ID)
	if stored == nil {
		t.Error("visit record not stored")
	}
}

func TestVisitBinding_ListMyVisitHistory(t *testing.T) {
	b, repo := setupVisitBinding(t)

	now := time.Now()
	for _, vr := range []*models.VisitRecord{
		{ID: "h1", PlaceID: "place-1", UserID: "user-A", AreaID: "area-1", ActivityID: "act-1", Result: models.VisitResultMet, VisitedAt: now.Add(-72 * time.Hour)},
		{ID: "h2", PlaceID: "place-1", UserID: "user-A", AreaID: "area-1", ActivityID: "act-1", Result: models.VisitResultAbsent, VisitedAt: now.Add(-24 * time.Hour)},
		{ID: "h3", PlaceID: "place-1", UserID: "user-B", AreaID: "area-1", ActivityID: "act-1", Result: models.VisitResultMet, VisitedAt: now},
	} {
		repo.SaveVisitRecord(vr)
	}

	mine, err := b.ListMyVisitHistory("place-1", "user-A")
	if err != nil {
		t.Fatalf("ListMyVisitHistory: %v", err)
	}
	if len(mine) != 2 {
		t.Errorf("history len = %d, want 2", len(mine))
	}
}

func TestVisitBinding_GetLastMetDate(t *testing.T) {
	b, repo := setupVisitBinding(t)

	now := time.Now().Truncate(time.Hour)
	for _, vr := range []*models.VisitRecord{
		// 古い met
		{ID: "v1", PlaceID: "p1", UserID: "user-X", AreaID: "area-1", ActivityID: "act-1", Result: models.VisitResultMet, VisitedAt: now.Add(-30 * 24 * time.Hour)},
		// 新しい absent (会えていない、対象外)
		{ID: "v2", PlaceID: "p1", UserID: "user-Y", AreaID: "area-1", ActivityID: "act-1", Result: models.VisitResultAbsent, VisitedAt: now.Add(-1 * 24 * time.Hour)},
		// 中間の met（最も新しい met）
		{ID: "v3", PlaceID: "p1", UserID: "user-Z", AreaID: "area-1", ActivityID: "act-1", Result: models.VisitResultMet, VisitedAt: now.Add(-7 * 24 * time.Hour)},
	} {
		repo.SaveVisitRecord(vr)
	}

	got, err := b.GetLastMetDate("p1")
	if err != nil {
		t.Fatalf("GetLastMetDate: %v", err)
	}
	if got == nil {
		t.Fatal("got nil, want time")
	}
	want := now.Add(-7 * 24 * time.Hour)
	if !got.Equal(want) {
		t.Errorf("got %v, want %v (newest met)", got, want)
	}
}

func TestVisitBinding_GetLastMetDate_NoMet(t *testing.T) {
	b, repo := setupVisitBinding(t)

	repo.SaveVisitRecord(&models.VisitRecord{
		ID: "v-only-absent", PlaceID: "p2", UserID: "user-A", AreaID: "area-1", ActivityID: "act-1",
		Result: models.VisitResultAbsent, VisitedAt: time.Now(),
	})

	got, err := b.GetLastMetDate("p2")
	if err != nil {
		t.Fatalf("GetLastMetDate: %v", err)
	}
	if got != nil {
		t.Errorf("got %v, want nil (no met record)", got)
	}
}
